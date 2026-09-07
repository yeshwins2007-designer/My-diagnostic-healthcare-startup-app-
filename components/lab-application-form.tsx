'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { submitLabApplication, type LabActionState } from '@/app/actions/lab';
import { Discipline, DISCIPLINE_LABELS, type Discipline as D } from '@/lib/enums';
import {
  Button,
  Card,
  Field,
  H3,
  Input,
  Muted,
  PrimaryActionBar,
  Select,
  Stack,
} from '@/components/ui';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" full disabled={pending}>
      {pending ? 'Submitting…' : 'Submit the application'}
    </Button>
  );
}

export function LabApplicationForm() {
  const [state, action] = useActionState<LabActionState, FormData>(submitLabApplication, {
    ok: false,
  });

  return (
    <form action={action}>
      <Stack gap="lg">
        <Card>
          <Stack gap="md">
            <H3>The laboratory</H3>
            <Field label="Trading name" required>
              <Input name="name" required placeholder="Ananya Diagnostics" />
            </Field>
            <Field label="Registered legal name" required>
              <Input name="legalName" required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact person" required>
                <Input name="contactName" required />
              </Field>
              <Field label="Contact phone" required>
                <Input name="contactPhone" type="tel" required />
              </Field>
            </div>
            <Field label="Contact email" required>
              <Input name="contactEmail" type="email" required />
            </Field>
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <H3>Where the samples will physically arrive</H3>
            <Muted>
              This must be the site a technician rides to, not a head office. We verify the two
              match.
            </Muted>
            <Field label="Address" required>
              <Input name="addressLine" required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="City" required>
                <Input name="city" defaultValue="Bengaluru" required />
              </Field>
              <Field label="State" required>
                <Input name="state" defaultValue="Karnataka" required />
              </Field>
              <Field label="Pincode" required>
                <Input name="pincode" inputMode="numeric" pattern="\d{6}" maxLength={6} required />
              </Field>
            </div>
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <H3>NABL accreditation</H3>

            <Field
              label="Certificate number"
              required
              hint="Medical laboratories are accredited under ISO 15189 and carry a number in the form MC-1234. A TC- number is a testing and calibration accreditation and cannot be used for human diagnostic samples."
            >
              <Input name="certificateNumber" required placeholder="MC-2417" className="font-mono uppercase" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Valid from" required>
                <Input name="validFrom" type="date" required />
              </Field>
              <Field label="Valid until" required>
                <Input name="validUntil" type="date" required />
              </Field>
            </div>

            <Field
              label="Accredited scope"
              required
              hint="Tick every discipline on your certificate. We match the discipline of each test against this list before routing — so leaving one out means less work sent to you, not more."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {Discipline.values.map((discipline) => (
                  <label
                    key={discipline}
                    className="flex min-h-[var(--size-touch)] items-center gap-3 rounded-[var(--radius-control)] border-2 border-[var(--color-line-strong)] px-4"
                  >
                    <input
                      type="checkbox"
                      name="scope"
                      value={discipline}
                      className="h-7 w-7 accent-[var(--color-primary)]"
                    />
                    <span>{DISCIPLINE_LABELS[discipline as D]}</span>
                  </label>
                ))}
              </div>
            </Field>

            <Field
              label="Health Facility Registry (HFR) id"
              hint="Optional, but it gives us an independent way to confirm your facility’s identity."
            >
              <Input name="hfrFacilityId" placeholder="IN2910001234" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Supervising pathologist" required>
                <Input name="supervisingPathologistName" required />
              </Field>
              <Field
                label="Council registration number"
                required
                hint="NMC or state medical council."
              >
                <Input name="supervisingPathologistReg" required />
              </Field>
            </div>
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <H3>Operating terms</H3>

            <Field
              label="Daily capacity ceiling"
              required
              hint="The number of samples a day above which we must give you advance notice. We would rather send you fewer and never overwhelm your bench."
            >
              <Input
                name="capacityCeiling"
                type="number"
                inputMode="numeric"
                min={1}
                defaultValue={40}
                required
              />
            </Field>

            <Field
              label="ABDM publishing"
              required
              hint="If you already push reports to ABDM yourself, say so — we will not publish on your behalf, because double-publishing creates duplicate records in the patient's own health account."
            >
              <Select name="abdmMode" required defaultValue="NONE">
                <option value="NONE">We do not publish to ABDM</option>
                <option value="LAB_SELF">We publish to ABDM ourselves</option>
                <option value="PLATFORM_FACILITATED">
                  Publish signed reports to the patient’s ABHA on our behalf
                </option>
              </Select>
            </Field>

            <label className="flex items-start gap-4">
              <input
                type="checkbox"
                name="brandingConsent"
                className="mt-1 h-12 w-12 shrink-0 accent-[var(--color-primary)]"
              />
              <span>
                We permit SwasthaSetu to name us in its materials.
                <span className="block text-[var(--text-small)] text-[var(--color-ink-faint)]">
                  For example: “Processed at Ananya Diagnostics, NABL-accredited MC-2417.” We
                  will not use your name anywhere without this.
                </span>
              </span>
            </label>
          </Stack>
        </Card>

        {state.reason && (
          <Card tone="red">
            <Stack gap="sm">
              <p className="font-semibold">{state.reason}</p>
              <p>{state.remedy}</p>
            </Stack>
          </Card>
        )}
        {state.message && !state.reason && (
          <p className="font-semibold text-[var(--color-red)]">{state.message}</p>
        )}

        <PrimaryActionBar>
          <Submit />
        </PrimaryActionBar>
      </Stack>
    </form>
  );
}
