'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { addPatient, type CaregiverActionState } from '@/app/actions/caregiver';
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
  Textarea,
} from '@/components/ui';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" full disabled={pending}>
      {pending ? 'Checking the address…' : 'Add and choose a plan'}
    </Button>
  );
}

export function AddPatientForm() {
  const [state, action] = useActionState<CaregiverActionState, FormData>(addPatient, {
    ok: false,
  });

  return (
    <form action={action}>
      <Stack gap="lg">
        <Card>
          <Stack gap="md">
            <H3>Who they are</H3>

            <Field label="Their full name" required>
              <Input name="name" required autoComplete="off" />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Age" required>
                <Input name="ageYears" type="number" inputMode="numeric" min={40} max={120} required />
              </Field>
              <Field label="Sex" required>
                <Select name="sex" required defaultValue="FEMALE">
                  <option value="FEMALE">Female</option>
                  <option value="MALE">Male</option>
                  <option value="OTHER">Other</option>
                </Select>
              </Field>
            </div>

            <Field
              label="Ongoing conditions"
              hint="Diabetes, blood pressure, thyroid, kidney — whatever the doctor is monitoring."
            >
              <Input name="conditions" placeholder="Type 2 diabetes, hypertension" />
            </Field>

            <Field label="Regular medicines">
              <Input name="medications" placeholder="Metformin, Amlodipine" />
            </Field>
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <H3>How the visit should go</H3>

            <Field
              label="How mobile are they?"
              required
              hint="This sets how long we book for the visit. Nobody should feel rushed."
            >
              <Select name="mobility" required defaultValue="INDEPENDENT">
                <option value="INDEPENDENT">Independent — moves around on their own</option>
                <option value="ASSISTED">Needs some help — slower, may need support</option>
                <option value="HOUSEBOUND">Housebound — frail, longer visit needed</option>
              </Select>
            </Field>

            <Field
              label="Anything the technician should know"
              hint="“Hard of hearing, speak on the left.” “Has dementia — greet slowly and re-introduce yourself.” “Veins are fragile, please warm the arm first.”"
            >
              <Textarea name="careNotes" className="min-h-28" />
            </Field>

            <label className="flex items-start gap-4">
              <input
                type="checkbox"
                name="needsProxyConsent"
                className="mt-1 h-12 w-12 shrink-0 accent-[var(--color-primary)]"
              />
              <span>
                They cannot give consent themselves and I am authorised to give it for them.
                <span className="block text-[var(--text-small)] text-[var(--color-ink-faint)]">
                  Tick this only if it is genuinely true — the technician will record family
                  authorisation at every visit instead of asking them directly.
                </span>
              </span>
            </label>
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <H3>Where they live</H3>

            <Field label="House number, building and street" required>
              <Input name="line1" required autoComplete="street-address" />
            </Field>

            <Field
              label="Landmark"
              hint="This matters more than the address. “Opposite the park gate.” “Last house on the lane, green door.”"
            >
              <Input name="landmark" />
            </Field>

            <div className="grid gap-5 sm:grid-cols-3">
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

        {state.waitlisted && (
          <Card tone="yellow">
            <Stack gap="sm">
              <H3>We cannot serve this address well yet</H3>
              <p>{state.reason}</p>
              <p>{state.remedy}</p>
              <Muted>
                We will not take your money for a service we would deliver badly. You are on the
                waitlist and we will call you.
              </Muted>
            </Stack>
          </Card>
        )}

        {!state.waitlisted && state.reason && (
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
