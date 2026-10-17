/**
 * Shared shapes for the SOP engine.
 *
 * Every rule is a pure function over plain data. Nothing here touches the
 * database, which is what makes the whole engine unit-testable without a
 * fixture database and what stops a rule quietly becoming advisory.
 */

/** A rule either permits an action, permits it with a warning, or refuses it. */
export type Decision =
  | { outcome: 'ALLOW' }
  | { outcome: 'WARN'; reason: string; detail?: Record<string, unknown> }
  | {
      outcome: 'REFUSE';
      reason: string;
      /** What the operator should do instead. Never a dead end. */
      remedy: string;
      detail?: Record<string, unknown>;
    };

export const allow = (): Decision => ({ outcome: 'ALLOW' });

export const warn = (reason: string, detail?: Record<string, unknown>): Decision => ({
  outcome: 'WARN',
  reason,
  detail,
});

export const refuse = (
  reason: string,
  remedy: string,
  detail?: Record<string, unknown>,
): Decision => ({ outcome: 'REFUSE', reason, remedy, detail });

export function isRefusal(d: Decision): d is Extract<Decision, { outcome: 'REFUSE' }> {
  return d.outcome === 'REFUSE';
}

/** Thrown when calling code asked a rule to enforce rather than advise. */
export class SopViolation extends Error {
  readonly reason: string;
  readonly remedy: string;
  readonly detail?: Record<string, unknown>;

  constructor(decision: Extract<Decision, { outcome: 'REFUSE' }>) {
    super(`${decision.reason} ${decision.remedy}`);
    this.name = 'SopViolation';
    this.reason = decision.reason;
    this.remedy = decision.remedy;
    this.detail = decision.detail;
  }
}

export function assertAllowed(decision: Decision): void {
  if (isRefusal(decision)) throw new SopViolation(decision);
}

/** One criterion inside a growth gate, so the UI can show what is missing. */
export interface Criterion {
  key: string;
  label: string;
  required: string;
  actual: string;
  met: boolean;
}
