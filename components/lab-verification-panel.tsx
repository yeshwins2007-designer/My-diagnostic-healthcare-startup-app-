'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  activateLab,
  recordAccreditationCheck,
  suspendLab,
  type ActionResult,
} from '@/app/actions/ops';
import { Badge, Button, Card, H3, Input, Muted, Stack } from '@/components/ui';

export interface CheckRow {
  key: string;
  label: string;
  passed: boolean | null;
  note: string;
  checkedBy: string | null;
  checkedAt: string | null;
}

function PendingButton({
  children,
  tone = 'primary',
}: {
  children: React.ReactNode;
  tone?: 'primary' | 'secondary' | 'danger';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tone={tone} disabled={pending}>
      {pending ? 'Working…' : children}
    </Button>
  );
}

export function LabVerificationPanel({
  labId,
  labName,
  status,
  accreditationId,
  checks,
  remainingCount,
}: {
  labId: string;
  labName: string;
  status: string;
  accreditationId: string;
  checks: CheckRow[];
  remainingCount: number;
}) {
  const [checkState, checkAction] = useActionState<ActionResult, FormData>(
    recordAccreditationCheck,
    { ok: false },
  );
  const [activateState, activateAction] = useActionState<ActionResult, FormData>(
    activateLab,
    { ok: false },
  );
  const [suspendState, suspendAction] = useActionState<ActionResult, FormData>(
    suspendLab,
    { ok: false },
  );

  return (
    <Stack gap="md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <H3 className="text-[var(--text-lead)]">Verification checklist</H3>
        <Badge tone={remainingCount === 0 ? 'green' : 'yellow'}>
          {checks.length - remainingCount} of {checks.length} passed
        </Badge>
      </div>

      <Stack gap="sm">
        {checks.map((check) => (
          <Card
            key={check.key}
            tone={check.passed === true ? 'green' : check.passed === false ? 'red' : 'sunken'}
            className="p-4"
          >
            <Stack gap="sm">
              <p className="font-medium">{check.label}</p>

              {check.checkedBy && (
                <Muted>
                  {check.passed ? 'Passed' : 'Failed'} by {check.checkedBy} on{' '}
                  {check.checkedAt ? new Date(check.checkedAt).toLocaleString('en-IN') : ''}
                  {check.note && ` — ${check.note}`}
                </Muted>
              )}

              <form action={checkAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="accreditationId" value={accreditationId} />
                <input type="hidden" name="checkKey" value={check.key} />
                <Input
                  name="note"
                  placeholder="What you checked, and where"
                  defaultValue={check.note}
                  className="min-w-56 flex-1"
                />
                <button
                  type="submit"
                  name="passed"
                  value="yes"
                  className="min-h-[var(--size-touch)] rounded-[var(--radius-control)] border-2 border-[var(--color-green)] bg-[var(--color-green-wash)] px-5 font-semibold text-[var(--color-green)]"
                >
                  Pass
                </button>
                <button
                  type="submit"
                  name="passed"
                  value="no"
                  className="min-h-[var(--size-touch)] rounded-[var(--radius-control)] border-2 border-[var(--color-red)] bg-[var(--color-red-wash)] px-5 font-semibold text-[var(--color-red)]"
                >
                  Fail
                </button>
              </form>
            </Stack>
          </Card>
        ))}
      </Stack>

      {checkState.message && <Muted>{checkState.message}</Muted>}

      <div className="flex flex-wrap gap-3 border-t-2 border-[var(--color-line)] pt-4">
        {status !== 'ACTIVE' && (
          <form action={activateAction}>
            <input type="hidden" name="labId" value={labId} />
            <PendingButton>Activate {labName}</PendingButton>
          </form>
        )}

        {status === 'ACTIVE' && (
          <form action={suspendAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="labId" value={labId} />
            <Input name="reason" placeholder="Reason for suspending" className="min-w-64" />
            <PendingButton tone="danger">Suspend</PendingButton>
          </form>
        )}
      </div>

      {(activateState.reason || suspendState.reason) && (
        <div className="rounded-[var(--radius-control)] border-2 border-[var(--color-red)] bg-[var(--color-red-wash)] p-4">
          <p className="font-semibold">{activateState.reason ?? suspendState.reason}</p>
          <p className="text-[var(--text-small)]">
            {activateState.remedy ?? suspendState.remedy}
          </p>
        </div>
      )}
      {activateState.ok && activateState.message && (
        <p className="font-semibold text-[var(--color-green)]">{activateState.message}</p>
      )}
      {suspendState.ok && suspendState.message && (
        <p className="font-semibold text-[var(--color-red)]">{suspendState.message}</p>
      )}
      {(activateState.message || suspendState.message) &&
        !activateState.ok &&
        !suspendState.ok &&
        !activateState.reason &&
        !suspendState.reason && (
          <p className="font-semibold text-[var(--color-red)]">
            {activateState.message ?? suspendState.message}
          </p>
        )}
    </Stack>
  );
}
