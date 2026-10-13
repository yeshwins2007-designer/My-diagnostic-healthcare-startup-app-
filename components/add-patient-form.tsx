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
  PrimaryActionBar,
  Select,
  Stack,
  Textarea,
} from '@/components/ui';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" full disabled={pending}>
      {pending ? 'Checking the address…' : 'Add and book tests'}
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
              hint="Diabetes, blood pressure, thyroid, kidneys: anything their doctor keeps an eye on."
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
              hint="We use this to decide how long to book, so nobody feels rushed."
            >
              <Select name="mobility" required defaultValue="INDEPENDENT">
                <option value="INDEPENDENT">Gets around on their own</option>
                <option value="ASSISTED">Needs some help moving around</option>
                <option value="HOUSEBOUND">Rarely leaves home, needs a longer visit</option>
              </Select>
            </Field>

            <Field
              label="Anything the technician should know"
              hint="For example: “Hard of hearing, please speak on his left side” or “Her veins are fragile, warm the arm first.”"
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
                They can’t give consent themselves, and I’m allowed to give it for them.
                <span className="block text-small text-[var(--color-ink-faint)]">
                  Only tick this if it’s true. At each visit, the technician will ask the family
                  for permission instead of asking your parent.
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
              hint="This often helps more than the address. Something like “opposite the park gate” or “last house on the lane, green door”."
            >
              <Input name="landmark" />
            </Field>

            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="City" required>
                <Input name="city" required autoComplete="address-level2" />
              </Field>
              <Field label="State" required>
                <Input name="state" required autoComplete="address-level1" />
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
              <H3>{state.reason}</H3>
              <p>{state.remedy}</p>
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
