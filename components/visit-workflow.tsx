'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import {
  logTemperature,
  markArrived,
  recordCollection,
  recordConsent,
  recordHandoff,
  type FieldActionState,
} from '@/app/actions/field';
import {
  Badge,
  Button,
  Card,
  Field,
  H3,
  Input,
  Muted,
  Select,
  Stack,
} from '@/components/ui';

export interface StepRow {
  key: string;
  label: string;
  sequence: number;
  blocking: boolean;
  actor: string;
  completedAt: string | null;
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" full disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

function Refusal({ state }: { state: FieldActionState }) {
  if (!state.reason) return null;
  return (
    <div className="rounded-[var(--radius-control)] border-2 border-[var(--color-red)] bg-[var(--color-red-wash)] p-4">
      <p className="font-semibold">{state.reason}</p>
      <p className="text-[var(--text-small)]">{state.remedy}</p>
    </div>
  );
}

/**
 * The eleven-step SOP, as the technician experiences it.
 *
 * Blocking steps are genuinely blocking: the collection form will not accept a
 * vial that was not labelled at the bedside, and the handoff will not record
 * without a sealed box and a logged temperature. The rule lives on the server;
 * this is just where it becomes visible.
 */
export function VisitWorkflow({
  bookingId,
  patientName,
  patientAge,
  reference,
  needsProxyConsent,
  status,
  labId,
  labName,
  hasConsent,
  specimen,
  tubeTypes,
  steps,
}: {
  bookingId: string;
  patientName: string;
  patientAge: number;
  reference: string;
  needsProxyConsent: boolean;
  status: string;
  labId: string;
  labName: string;
  hasConsent: boolean;
  specimen: {
    id: string;
    barcode: string;
    intakeAt: string | null;
    latestTemperature: number | null;
    sealed: boolean;
  } | null;
  tubeTypes: string[];
  steps: StepRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const [consentState, consentAction] = useActionState<FieldActionState, FormData>(
    recordConsent,
    { ok: false },
  );
  const [collectState, collectAction] = useActionState<FieldActionState, FormData>(
    recordCollection,
    { ok: false },
  );
  const [tempState, tempAction] = useActionState<FieldActionState, FormData>(
    logTemperature,
    { ok: false },
  );
  const [handoffState, handoffAction] = useActionState<FieldActionState, FormData>(
    recordHandoff,
    { ok: false },
  );

  const arrived = ['ARRIVED', 'COLLECTED', 'IN_TRANSIT', 'AT_LAB', 'CLOSED'].includes(status);
  const collected = ['COLLECTED', 'IN_TRANSIT', 'AT_LAB', 'CLOSED'].includes(status);
  const handedOver = specimen?.intakeAt !== null && specimen?.intakeAt !== undefined;

  return (
    <Stack gap="lg">
      {/* 1. Arrival */}
      {!arrived && (
        <Card>
          <Stack gap="sm">
            <H3>Step 5 · You are at the door</H3>
            <Muted>
              Announce your name, show your ID, and confirm the patient’s name aloud before
              anything else.
            </Muted>
            <Button
              full
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await markArrived(bookingId);
                  setNotice(result.message ?? null);
                })
              }
            >
              I have arrived
            </Button>
            {notice && <p className="font-semibold">{notice}</p>}
          </Stack>
        </Card>
      )}

      {/* 2. Consent */}
      {arrived && !hasConsent && (
        <Card tone="primary">
          <form action={consentAction}>
            <Stack gap="md">
              <input type="hidden" name="bookingId" value={bookingId} />
              <H3>Step 5 · Consent</H3>

              {needsProxyConsent && (
                <Card tone="yellow" className="p-4">
                  <Muted>
                    {patientName} cannot give informed consent themselves. Record family
                    authorisation, with the name and relationship of whoever is authorising. If
                    nobody is present who can, stop and call the coordinator.
                  </Muted>
                </Card>
              )}

              <Field label="How was consent given?" required>
                <Select
                  name="method"
                  required
                  defaultValue={needsProxyConsent ? 'PROXY_FAMILY' : 'VERBAL_RECORDED'}
                >
                  <option value="VERBAL_RECORDED">Spoken, and I recorded it</option>
                  <option value="WRITTEN">Written, on the consent form</option>
                  <option value="DIGITAL_TAP">They tapped agree on this screen</option>
                  <option value="PROXY_FAMILY">Family member authorised on their behalf</option>
                </Select>
              </Field>

              {needsProxyConsent && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Who authorised" required>
                    <Input name="proxyName" required />
                  </Field>
                  <Field label="Their relationship" required>
                    <Input name="proxyRelation" placeholder="Daughter" required />
                  </Field>
                </div>
              )}

              <Refusal state={consentState} />
              {consentState.ok && consentState.message && (
                <p className="font-semibold">{consentState.message}</p>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="submit"
                  name="granted"
                  value="yes"
                  className="min-h-[var(--size-touch-lg)] rounded-[var(--radius-control)] border-2 border-[var(--color-green)] bg-[var(--color-green-wash)] px-5 text-[var(--text-lead)] font-semibold text-[var(--color-green)]"
                >
                  They agreed
                </button>
                <button
                  type="submit"
                  name="granted"
                  value="no"
                  className="min-h-[var(--size-touch-lg)] rounded-[var(--radius-control)] border-2 border-[var(--color-red)] bg-[var(--color-red-wash)] px-5 text-[var(--text-lead)] font-semibold text-[var(--color-red)]"
                >
                  They declined
                </button>
              </div>
            </Stack>
          </form>
        </Card>
      )}

      {/* 3. Collection and bedside labelling */}
      {hasConsent && !collected && (
        <Card>
          <form action={collectAction}>
            <Stack gap="md">
              <input type="hidden" name="bookingId" value={bookingId} />
              <H3>Step 6 · Label at the bedside</H3>
              <Muted>
                Two identifiers on every vial, written here, in front of the patient. Never
                afterwards.
              </Muted>

              <Field label="First identifier" required hint="Their full name, as they said it.">
                <Input name="identifier1" defaultValue={patientName} required />
              </Field>

              <Field
                label="Second identifier"
                required
                hint="Age and the booking reference is the pairing we use."
              >
                <Input
                  name="identifier2"
                  defaultValue={`Age ${patientAge} · ${reference}`}
                  required
                />
              </Field>

              <Field label="Tube" required>
                <Select name="tubeType" required defaultValue={tubeTypes[0]}>
                  {tubeTypes.map((tube) => (
                    <option key={tube} value={tube}>
                      {tube}
                    </option>
                  ))}
                </Select>
              </Field>

              <label className="flex items-start gap-4">
                <input
                  type="checkbox"
                  name="labelledAtBedside"
                  className="mt-1 h-8 w-8 shrink-0 accent-[var(--color-primary)]"
                />
                <span className="font-semibold">
                  I labelled this vial at the bedside, with both identifiers.
                </span>
              </label>

              <Refusal state={collectState} />
              {collectState.ok && collectState.message && (
                <p className="font-semibold text-[var(--color-green)]">{collectState.message}</p>
              )}

              <Submit label="Collected" />
            </Stack>
          </form>
        </Card>
      )}

      {/* 4. Cold chain */}
      {specimen && !handedOver && (
        <Card>
          <form action={tempAction}>
            <Stack gap="md">
              <input type="hidden" name="specimenId" value={specimen.id} />
              <H3>Step 7 · Cold box</H3>

              {specimen.latestTemperature !== null ? (
                <Badge tone={specimen.sealed ? 'green' : 'yellow'}>
                  last reading {specimen.latestTemperature.toFixed(1)} °C ·{' '}
                  {specimen.sealed ? 'sealed' : 'NOT SEALED'}
                </Badge>
              ) : (
                <Badge tone="red">no temperature logged yet</Badge>
              )}

              <Field label="Temperature on the box (°C)" required>
                <Input
                  name="temperatureC"
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  required
                />
              </Field>

              <label className="flex items-start gap-4">
                <input
                  type="checkbox"
                  name="boxSealed"
                  defaultChecked
                  className="mt-1 h-8 w-8 shrink-0 accent-[var(--color-primary)]"
                />
                <span className="font-semibold">The box is sealed.</span>
              </label>

              <Refusal state={tempState} />
              {tempState.ok && tempState.message && (
                <p className="font-semibold">{tempState.message}</p>
              )}

              <Submit label="Log the temperature" />
            </Stack>
          </form>
        </Card>
      )}

      {/* 5. Handoff */}
      {specimen && !handedOver && (
        <Card tone="sunken">
          <form action={handoffAction}>
            <Stack gap="md">
              <input type="hidden" name="specimenId" value={specimen.id} />
              <input type="hidden" name="labId" value={labId} />
              <H3>Step 8 · Handover at {labName}</H3>
              <Muted>
                The chain of custody closes here. It will not record without a sealed box and a
                logged temperature.
              </Muted>

              <Field label="Who received it at the intake desk?" required>
                <Input name="receivedByName" required />
              </Field>

              <Refusal state={handoffState} />
              {handoffState.ok && handoffState.message && (
                <p className="font-semibold text-[var(--color-green)]">
                  {handoffState.message}
                </p>
              )}

              <Submit label="Record the handover" />
            </Stack>
          </form>
        </Card>
      )}

      {/* The full SOP, always visible */}
      <Card tone="sunken">
        <Stack gap="sm">
          <H3>The eleven steps</H3>
          <ol className="flex flex-col gap-2">
            {steps.map((step) => (
              <li key={step.key} className="flex gap-3">
                <span
                  aria-hidden
                  className={
                    step.completedAt
                      ? 'text-[var(--color-green)]'
                      : 'text-[var(--color-ink-faint)]'
                  }
                >
                  {step.completedAt ? '✓' : '○'}
                </span>
                <span className={step.completedAt ? 'text-[var(--color-ink-faint)]' : ''}>
                  {step.sequence}. {step.label}
                  {step.blocking && !step.completedAt && (
                    <span className="ml-2 text-[var(--text-tiny)] font-semibold text-[var(--color-red)]">
                      blocking
                    </span>
                  )}
                  {step.actor !== 'TECHNICIAN' && (
                    <span className="ml-2 text-[var(--text-tiny)] text-[var(--color-ink-faint)]">
                      ({step.actor.toLowerCase()})
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </Stack>
      </Card>
    </Stack>
  );
}
