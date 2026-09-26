/**
 * Where the sample is, from booking to report.
 *
 * Every step is a real booking status, never a simulated percentage. A
 * progress bar that fills on a timer is reassuring right up until a family
 * learns it was theatre, and after that they trust nothing else on the
 * screen — including the results. So this moves only when the booking does.
 *
 * Driven entirely by status, so it renders on the server with no client code.
 */

const STEPS = [
  { key: 'booked', label: 'Booked' },
  { key: 'coming', label: 'On the way' },
  { key: 'collected', label: 'Collected' },
  { key: 'lab', label: 'At the lab' },
  { key: 'ready', label: 'Report ready' },
] as const;

const STEP_FOR_STATUS: Record<string, number> = {
  REQUESTED: 0,
  SCHEDULED: 0,
  EN_ROUTE: 1,
  ARRIVED: 1,
  COLLECTED: 2,
  IN_TRANSIT: 2,
  AT_LAB: 3,
  PROCESSING: 3,
  REPORTED: 4,
  CLOSED: 4,
};

/** What the current step means in words, so the status is never colour or position alone. */
const NOW: Record<string, string> = {
  REQUESTED: 'We have your request and are confirming the slot.',
  SCHEDULED: 'The visit is booked.',
  EN_ROUTE: 'The technician is on the way.',
  ARRIVED: 'The technician has arrived.',
  COLLECTED: 'The sample has been collected and labelled at the bedside.',
  IN_TRANSIT: 'The sample is in a sealed, temperature-logged box on its way to the laboratory.',
  AT_LAB: 'The laboratory has received the sample.',
  PROCESSING: 'The laboratory is running the tests.',
  REPORTED: 'The report is signed and being checked by our coordinator before release.',
  CLOSED: 'The report is ready.',
};

export function SampleJourney({ status }: { status: string }) {
  const current = STEP_FOR_STATUS[status];
  if (current === undefined) return null;

  /*
    Vertical, not a horizontal stepper. Five labels across a phone leave about
    60px each, and the reader-size control scales text up to 1.32x — so any
    horizontal layout that fits at the default size collides for exactly the
    people who asked for bigger text. A vertical list never runs out of width.
  */
  return (
    <div className="flex flex-col gap-4">
      <p className="font-medium" aria-live="polite">
        {NOW[status]}
      </p>

      <ol
        className="flex flex-col"
        aria-label={`Step ${current + 1} of ${STEPS.length}: ${STEPS[current].label}`}
      >
        {STEPS.map((step, i) => {
          const done = i < current;
          const now = i === current;
          const last = i === STEPS.length - 1;
          return (
            <li
              key={step.key}
              className="relative flex min-h-11 items-start gap-4"
              aria-current={now ? 'step' : undefined}
            >
              {/* connector to the next step, coloured once that stretch is done */}
              {!last && (
                <span
                  aria-hidden
                  className="absolute top-6 left-[11px] w-[2px] rounded-full"
                  style={{
                    bottom: 0,
                    background:
                      i < current ? 'var(--color-primary)' : 'var(--color-line-strong)',
                  }}
                />
              )}
              <span
                aria-hidden
                className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  done || now
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-ink)]'
                    : 'border-[var(--color-line-strong)] bg-[var(--color-surface)]'
                }`}
                style={now ? { boxShadow: '0 0 0 4px var(--color-primary-wash)' } : undefined}
              >
                {done && (
                  <svg viewBox="0 0 16 16" width="12" height="12">
                    <path
                      d="M3 8.5l3 3 7-7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span
                className={`flex flex-wrap items-center gap-2 pb-4 leading-6 ${
                  now
                    ? 'font-bold text-[var(--color-ink)]'
                    : done
                      ? 'font-medium text-[var(--color-ink-soft)]'
                      : 'text-[var(--color-ink-soft)]'
                }`}
              >
                {step.label}
                {now && (
                  <span className="rounded-full bg-[var(--color-primary-wash)] px-2 py-0.5 text-tiny font-semibold text-[var(--color-primary)]">
                    Now
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
