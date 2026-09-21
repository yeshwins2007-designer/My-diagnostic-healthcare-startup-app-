/**
 * UI primitives.
 *
 * The elderly design rules live here rather than in a style guide nobody
 * reads: a Button is 64px tall because the component makes it so, not because
 * a designer remembered. Every surface in the app composes from these.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// --- layout ------------------------------------------------------------------

export function Page({
  children,
  className,
  wide,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <main
      className={cx(
        'mx-auto w-full px-5 py-8 sm:px-8',
        wide ? 'max-w-7xl' : 'max-w-3xl',
        className,
      )}
    >
      {children}
    </main>
  );
}

export function Stack({
  children,
  gap = 'md',
  className,
}: {
  children: ReactNode;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const gaps = { sm: 'gap-3', md: 'gap-5', lg: 'gap-8' };
  return <div className={cx('flex flex-col', gaps[gap], className)}>{children}</div>;
}

export function Card({
  children,
  className,
  tone = 'surface',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'surface' | 'sunken' | 'primary' | 'green' | 'yellow' | 'red' | 'info';
  as?: 'section' | 'article' | 'div' | 'li';
}) {
  const tones: Record<string, string> = {
    surface: 'bg-[var(--color-surface)] border-[var(--color-line)]',
    sunken: 'bg-[var(--color-surface-sunken)] border-[var(--color-line)]',
    primary: 'bg-[var(--color-primary-wash)] border-[var(--color-primary)]',
    green: 'bg-[var(--color-green-wash)] border-[var(--color-green)]',
    yellow: 'bg-[var(--color-yellow-wash)] border-[var(--color-yellow)]',
    red: 'bg-[var(--color-red-wash)] border-[var(--color-red)]',
    info: 'bg-[var(--color-info-wash)] border-[var(--color-info)]',
  };
  return (
    <Tag
      className={cx(
        'rounded-[var(--radius-card)] border-2 p-5 sm:p-6',
        tones[tone],
        className,
      )}
    >
      {children}
    </Tag>
  );
}

// --- type --------------------------------------------------------------------

export function H1({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={cx('text-[var(--text-h1)] font-bold tracking-tight', className)}>
      {children}
    </h1>
  );
}

export function H2({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cx('text-[var(--text-h2)] font-bold', className)}>{children}</h2>;
}

export function H3({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cx('text-[var(--text-h3)] font-semibold', className)}>{children}</h3>;
}

export function Lead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx('text-[var(--text-lead)] text-[var(--color-ink-soft)]', className)}>
      {children}
    </p>
  );
}

export function Muted({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx('text-[var(--text-small)] text-[var(--color-ink-faint)]', className)}>
      {children}
    </p>
  );
}

// --- controls ----------------------------------------------------------------

type ButtonTone = 'primary' | 'secondary' | 'quiet' | 'danger';

const buttonTones: Record<ButtonTone, string> = {
  primary:
    'bg-[var(--color-primary)] text-[var(--color-primary-ink)] border-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]',
  secondary:
    'bg-[var(--color-surface)] text-[var(--color-ink)] border-[var(--color-line-strong)] hover:bg-[var(--color-surface-sunken)]',
  quiet:
    'bg-transparent text-[var(--color-ink-soft)] border-transparent hover:bg-[var(--color-surface-sunken)]',
  danger:
    'bg-[var(--color-red)] text-white border-[var(--color-red)] hover:opacity-90',
};

const buttonBase =
  'inline-flex items-center justify-center gap-3 rounded-[var(--radius-control)] border-2 px-6 font-semibold min-h-[var(--size-touch)] text-[var(--text-base)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

export function Button({
  children,
  tone = 'primary',
  full,
  className,
  ...rest
}: {
  children: ReactNode;
  tone?: ButtonTone;
  full?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={cx(buttonBase, buttonTones[tone], full && 'w-full', className)}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  href,
  tone = 'primary',
  full,
  className,
}: {
  children: ReactNode;
  href: string;
  tone?: ButtonTone;
  full?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cx(buttonBase, buttonTones[tone], full && 'w-full', className)}
    >
      {children}
    </Link>
  );
}

/**
 * One primary action per screen, anchored at the bottom within thumb reach.
 * A 78-year-old holding a phone one-handed cannot comfortably reach the top.
 */
export function PrimaryActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-5 mt-8 border-t-2 border-[var(--color-line)] bg-[var(--color-canvas)] px-5 py-4 sm:-mx-8 sm:px-8">
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  required,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-semibold">
        {label}
        {required && <span className="text-[var(--color-red)]"> *</span>}
      </span>
      {hint && <span className="text-[var(--text-small)] text-[var(--color-ink-faint)]">{hint}</span>}
      {children}
      {error && (
        <span className="text-[var(--text-small)] font-medium text-[var(--color-red)]">
          {error}
        </span>
      )}
    </label>
  );
}

const inputBase =
  'w-full rounded-[var(--radius-control)] border-2 border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-3 min-h-[var(--size-touch)] text-[var(--text-base)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)]';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputBase, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputBase, 'min-h-32', props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputBase, props.className)} />;
}

// --- status ------------------------------------------------------------------

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'green' | 'yellow' | 'red' | 'info' | 'primary';
}) {
  const tones: Record<string, string> = {
    neutral:
      'bg-[var(--color-surface-sunken)] text-[var(--color-ink-soft)] border-[var(--color-line-strong)]',
    green: 'bg-[var(--color-green-wash)] text-[var(--color-green)] border-[var(--color-green)]',
    yellow:
      'bg-[var(--color-yellow-wash)] text-[var(--color-yellow)] border-[var(--color-yellow)]',
    red: 'bg-[var(--color-red-wash)] text-[var(--color-red)] border-[var(--color-red)]',
    info: 'bg-[var(--color-info-wash)] text-[var(--color-info)] border-[var(--color-info)]',
    primary:
      'bg-[var(--color-primary-wash)] text-[var(--color-primary)] border-[var(--color-primary)]',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-2 rounded-full border-2 px-3 py-1 text-[var(--text-small)] font-semibold',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * Shown wherever an integration is running against a simulator, so nobody
 * mistakes a demo payment or a fake ABHA number for a real one.
 */
export function SimulatedChip({ what }: { what: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border-2 border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface-sunken)] px-3 py-1 text-[var(--text-tiny)] font-semibold text-[var(--color-ink-faint)]">
      simulated {what}
    </span>
  );
}

/** A refusal from the SOP engine, rendered so it always shows the remedy. */
export function RefusalNotice({
  reason,
  remedy,
  title = 'This is not allowed',
}: {
  reason: string;
  remedy: string;
  title?: string;
}) {
  return (
    <Card tone="red">
      <Stack gap="sm">
        <H3 className="text-[var(--color-red)]">{title}</H3>
        <p className="font-medium">{reason}</p>
        <p className="text-[var(--color-ink-soft)]">{remedy}</p>
      </Stack>
    </Card>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card tone="sunken">
      <Stack gap="sm">
        <H3>{title}</H3>
        <p className="text-[var(--color-ink-soft)]">{body}</p>
        {action}
      </Stack>
    </Card>
  );
}

/** The disclaimer that must appear on every summary, digital or printed. */
export function Disclaimer({ text }: { text: string }) {
  return (
    <p className="rounded-[var(--radius-control)] border-2 border-[var(--color-line)] bg-[var(--color-surface-sunken)] p-4 text-[var(--text-small)] leading-relaxed text-[var(--color-ink-soft)]">
      {text}
    </p>
  );
}

export function DataRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: 'green' | 'yellow' | 'red';
}) {
  const toneClass =
    tone === 'green'
      ? 'text-[var(--color-green)]'
      : tone === 'yellow'
        ? 'text-[var(--color-yellow)]'
        : tone === 'red'
          ? 'text-[var(--color-red)]'
          : '';
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-line)] py-3 last:border-b-0">
      <span className="text-[var(--color-ink-soft)]">{label}</span>
      <span className={cx('font-semibold', toneClass)}>{value}</span>
    </div>
  );
}
