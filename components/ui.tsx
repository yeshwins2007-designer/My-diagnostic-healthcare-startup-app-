/**
 * UI primitives: the Obsidian system's parts.
 *
 * Every surface composes from these, so the rules live in the components and
 * not in a style guide: a Button is 48px tall because the component makes it
 * so; a status colour appears only through a status component. The props are
 * unchanged from the previous system, so screens switch look without their
 * logic changing.
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
        'mx-auto w-full px-5 py-6 sm:px-8 sm:py-10',
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
  const gaps = { sm: 'gap-2.5', md: 'gap-4', lg: 'gap-8' };
  return <div className={cx('flex flex-col', gaps[gap], className)}>{children}</div>;
}

export type Tone = 'surface' | 'sunken' | 'primary' | 'green' | 'yellow' | 'red' | 'info';

export function Card({
  children,
  className,
  tone = 'surface',
  as: Tag = 'section',
  elevated,
  style,
}: {
  children: ReactNode;
  className?: string;
  /** For per-instance values that cannot be classes, e.g. a stagger delay. */
  style?: React.CSSProperties;
  tone?: Tone;
  as?: 'section' | 'article' | 'div' | 'li';
  /** The flagship container: the result, the summary. One or two per screen. */
  elevated?: boolean;
}) {
  const tones: Record<Tone, string> = {
    surface: 'panel',
    sunken: 'bg-[var(--color-surface-sunken)] border-[var(--color-line)]',
    primary: 'bg-[var(--color-primary-wash)] border-[var(--color-line-strong)]',
    green: 'bg-[var(--color-green-wash)] border-[color-mix(in_oklab,var(--color-green)_30%,transparent)]',
    yellow: 'bg-[var(--color-yellow-wash)] border-[color-mix(in_oklab,var(--color-yellow)_30%,transparent)]',
    // Critical keeps a full-strength edge: it must never read as subtle.
    red: 'bg-[var(--color-red-wash)] border-[var(--color-red)]',
    info: 'bg-[var(--color-info-wash)] border-[color-mix(in_oklab,var(--color-info)_30%,transparent)]',
  };
  return (
    <Tag
      className={cx(
        'border p-5 sm:p-6',
        elevated
          ? 'rounded-[var(--radius-card-lg)] [box-shadow:var(--shadow-card)]'
          : 'rounded-[var(--radius-card)]',
        tones[tone],
        className,
      )}
      style={style}
    >
      {children}
    </Tag>
  );
}

// --- type --------------------------------------------------------------------

export function H1({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cx('text-h1 font-semibold tracking-tight', className)}>{children}</h1>;
}

export function H2({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cx('text-h2 font-semibold tracking-tight', className)}>{children}</h2>;
}

export function H3({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cx('text-h3 font-semibold', className)}>{children}</h3>;
}

export function Lead({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('text-lead text-[var(--color-ink-soft)]', className)}>{children}</p>;
}

export function Muted({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('text-small text-[var(--color-ink-faint)]', className)}>{children}</p>;
}

/** An instrument label: 10px, uppercase, wide, muted. Never an instruction. */
export function Eyebrow({
  children,
  className,
  as: Tag = 'span',
}: {
  children: ReactNode;
  className?: string;
  as?: 'span' | 'p' | 'h2' | 'h3' | 'dt';
}) {
  return <Tag className={cx('eyebrow', className)}>{children}</Tag>;
}

// --- status ------------------------------------------------------------------

export type StatusTone = 'green' | 'yellow' | 'red' | 'info' | 'neutral' | 'primary';

const statusText: Record<StatusTone, string> = {
  green: 'text-[var(--color-green)]',
  yellow: 'text-[var(--color-yellow)]',
  red: 'text-[var(--color-red)]',
  info: 'text-[var(--color-info)]',
  neutral: 'text-[var(--color-ink-faint)]',
  primary: 'text-[var(--color-ink)]',
};

/** A status light. `live` adds a slow ring for something happening now. */
export function StatusDot({ tone = 'neutral', live }: { tone?: StatusTone; live?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx('relative inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current', live && 'dot-live', statusText[tone])}
    />
  );
}

/**
 * A reading: a label, a monospaced value, an optional unit and status. The
 * unit of every status grid.
 */
export function Metric({
  label,
  value,
  unit,
  tone,
  sub,
  live,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: StatusTone;
  sub?: ReactNode;
  live?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-2', className)}>
      <span className="eyebrow flex items-center gap-2">
        {tone && <StatusDot tone={tone} live={live} />}
        {label}
      </span>
      <span
        className={cx(
          'flex items-baseline gap-1.5 text-[1.375rem] font-medium leading-none tracking-tight',
          // Numbers read as instrument readings; words stay in the sans face.
          typeof value === 'string' && /\d/.test(value) ? 'reading' : 'text-[var(--color-ink)]',
        )}
      >
        <span className={cx('min-w-0 truncate', tone && tone !== 'neutral' && tone !== 'primary' && statusText[tone])}>{value}</span>
        {unit && <span className="text-small text-[var(--color-ink-faint)]">{unit}</span>}
      </span>
      {sub && <span className="text-small text-[var(--color-ink-faint)]">{sub}</span>}
    </div>
  );
}

// --- controls ----------------------------------------------------------------

type ButtonTone = 'primary' | 'secondary' | 'quiet' | 'danger';

const buttonTones: Record<ButtonTone, string> = {
  primary: 'btn-glow text-[var(--color-primary-ink)] border-transparent',
  secondary:
    'bg-transparent text-[var(--color-ink)] border-[var(--color-line-strong)] hover:bg-[var(--color-primary-wash)]',
  quiet:
    'bg-transparent text-[var(--color-ink-soft)] border-transparent hover:bg-[var(--color-primary-wash)] hover:text-[var(--color-ink)]',
  danger:
    'bg-[var(--color-red)] text-[var(--color-red-ink)] border-[var(--color-red)] hover:opacity-90',
};

const buttonBase =
  'inline-flex items-center justify-center gap-2.5 rounded-[var(--radius-control)] border px-5 font-medium min-h-[var(--size-touch)] text-[0.9375rem] tracking-[-0.005em] disabled:opacity-40 disabled:cursor-not-allowed';

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
    <button {...rest} className={cx(buttonBase, buttonTones[tone], full && 'w-full', className)}>
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
    <Link href={href} className={cx(buttonBase, buttonTones[tone], full && 'w-full', className)}>
      {children}
    </Link>
  );
}

/** One primary action per screen, anchored at the bottom within thumb reach. */
export function PrimaryActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="glass stick-above-nav sticky -mx-5 mt-8 border-t px-5 py-4 sm:-mx-8 sm:px-8">
      {children}
    </div>
  );
}

/**
 * A form field. Its name is an instruction, so it is set to be read (14px),
 * not as a 10px instrument label.
 */
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
      <span className="text-small font-medium text-[var(--color-ink-soft)]">
        {label}
        {required && <span className="text-[var(--color-ink-faint)]"> *</span>}
      </span>
      {hint && <span className="text-small text-[var(--color-ink-faint)]">{hint}</span>}
      {children}
      {error && (
        <span className="flex items-center gap-2 text-small font-medium text-[var(--color-red)]">
          <StatusDot tone="red" />
          {error}
        </span>
      )}
    </label>
  );
}

const inputBase =
  'w-full rounded-[var(--radius-control)] border border-[var(--color-line-strong)] bg-[var(--field-bg)] px-4 py-2.5 min-h-[var(--size-touch)] text-base text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] hover:border-[color-mix(in_oklab,var(--color-ink)_24%,transparent)] focus:border-[var(--color-ink-faint)] focus:outline-none focus:shadow-[0_0_0_4px_var(--color-primary-wash)]';

// ComponentProps rather than *HTMLAttributes: in React 19 ref is an ordinary
// prop, and the attribute types omit it, which blocks forwarding a ref.
export function Input(props: React.ComponentProps<'input'>) {
  return <input {...props} className={cx(inputBase, props.className)} />;
}

export function Textarea(props: React.ComponentProps<'textarea'>) {
  return <textarea {...props} className={cx(inputBase, 'min-h-32', props.className)} />;
}

export function Select(props: React.ComponentProps<'select'>) {
  return <select {...props} className={cx(inputBase, props.className)} />;
}

/**
 * A status chip: a light and an uppercase reading. The words carry the
 * meaning; the colour confirms it.
 *
 * Red ignores 'tonal': a critical value must never read as subtle.
 */
export function Badge({
  children,
  tone = 'neutral',
  variant = 'solid',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'green' | 'yellow' | 'red' | 'info' | 'primary';
  variant?: 'solid' | 'tonal';
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-[var(--color-surface-sunken)] text-[var(--color-ink-soft)] border-[var(--color-line-strong)]',
    green: 'bg-[var(--color-green-wash)] text-[var(--color-green)] border-[color-mix(in_oklab,var(--color-green)_35%,transparent)]',
    yellow: 'bg-[var(--color-yellow-wash)] text-[var(--color-yellow)] border-[color-mix(in_oklab,var(--color-yellow)_35%,transparent)]',
    red: 'bg-[var(--color-red-wash)] text-[var(--color-red)] border-[var(--color-red)]',
    info: 'bg-[var(--color-info-wash)] text-[var(--color-info)] border-[color-mix(in_oklab,var(--color-info)_35%,transparent)]',
    primary: 'bg-[var(--color-primary-wash)] text-[var(--color-ink)] border-[var(--color-line-strong)]',
  };
  const tonal = variant === 'tonal' && tone !== 'red';
  return (
    <span
      className={cx(
        'inline-flex w-fit items-center gap-2 rounded-full border px-2.5 py-1 text-[0.6875rem] font-medium uppercase leading-none tracking-[0.12em]',
        tones[tone],
        tonal && 'border-transparent',
      )}
    >
      <StatusDot tone={tone === 'neutral' ? 'neutral' : tone} />
      {children}
    </span>
  );
}

// --- loading -------------------------------------------------------------------

/**
 * A placeholder bar in the shape of the content that is coming. `index`
 * offsets its pulse so a column of bars reads as a stream, not a block.
 */
export function Skeleton({ className, index = 0 }: { className?: string; index?: number }) {
  return (
    <span
      aria-hidden
      className={cx('skeleton block', className)}
      style={{ ['--i' as string]: index } as React.CSSProperties}
    />
  );
}

/**
 * The loading state: a status line with a ticker, then rows of bars in the
 * shape of the screen. Announced once to assistive tech.
 */
export function DataStream({
  label = 'Loading',
  rows = 4,
  className,
}: {
  label?: string;
  rows?: number;
  className?: string;
}) {
  const widths = ['w-11/12', 'w-2/3', 'w-4/5', 'w-1/2', 'w-3/4', 'w-5/6'];
  return (
    <div role="status" aria-live="polite" className={cx('flex flex-col gap-3', className)}>
      <span className="eyebrow flex items-center gap-3">
        <span className="ticker" aria-hidden>
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
        {label}
      </span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="panel flex flex-col gap-3 rounded-[var(--radius-card)] border p-5">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-2.5 w-24" index={i * 3} />
            <Skeleton className="h-2.5 w-12" index={i * 3 + 1} />
          </div>
          <Skeleton className={cx('h-5', widths[i % widths.length])} index={i * 3 + 2} />
        </div>
      ))}
    </div>
  );
}

// --- notices -------------------------------------------------------------------

/**
 * Shown wherever an integration is running against a simulator, so nobody
 * mistakes a demo payment or a fake ABHA number for a real one.
 */
export function SimulatedChip({ what }: { what: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-dashed border-[var(--color-line-strong)] px-2.5 py-1 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
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
        <H3 className="flex items-center gap-2.5 text-[var(--color-red)]">
          <StatusDot tone="red" />
          {title}
        </H3>
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
    <Card tone="sunken" className="border-dashed">
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
    <p className="rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface-sunken)] p-4 text-small leading-relaxed text-[var(--color-ink-faint)]">
      {text}
    </p>
  );
}

/** A labelled reading on one line: label left, monospaced value right. */
export function DataRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: 'green' | 'yellow' | 'red';
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-line)] py-3 last:border-b-0">
      <span className="eyebrow">{label}</span>
      <span className={cx('reading flex items-center gap-2 font-medium', tone && statusText[tone])}>
        {tone && <StatusDot tone={tone} />}
        {value}
      </span>
    </div>
  );
}
