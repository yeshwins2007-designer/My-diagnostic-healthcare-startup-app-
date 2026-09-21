'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import {
  completeAbha,
  initiateAbha,
  linkExistingAbha,
  requestHealthHistory,
  revokeAbdmConsent,
  type AbhaActionState,
} from '@/app/actions/abha';
import {
  Badge,
  Button,
  Card,
  Field,
  H3,
  Input,
  Muted,
  Stack,
} from '@/components/ui';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" full disabled={pending}>
      {pending ? 'Please wait…' : label}
    </Button>
  );
}

export function AbhaFlow({
  patientId,
  patientName,
  mode,
  consents,
}: {
  patientId: string;
  patientName: string;
  mode: 'NONE' | 'LINKED';
  consents: { consentId: string; status: string; hiTypes: string; expiresAt: string }[];
}) {
  const [tab, setTab] = useState<'CREATE' | 'LINK'>('LINK');
  const [method, setMethod] = useState<'AADHAAR_OTP' | 'MOBILE_OTP'>('MOBILE_OTP');
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const [initState, initAction] = useActionState<AbhaActionState, FormData>(initiateAbha, {
    ok: false,
  });
  const [completeState, completeAction] = useActionState<AbhaActionState, FormData>(
    completeAbha,
    { ok: false },
  );
  const [linkState, linkAction] = useActionState<AbhaActionState, FormData>(
    linkExistingAbha,
    { ok: false },
  );

  if (mode === 'LINKED') {
    const granted = consents.find((c) => c.status === 'GRANTED');

    return (
      <Card>
        <Stack gap="md">
          <H3>Past records from other hospitals and labs</H3>

          {granted ? (
            <Stack gap="sm">
              <Badge tone="green">Consent granted</Badge>
              <Muted>
                Covers {granted.hiTypes.replace(/,/g, ', ')} until{' '}
                {new Date(granted.expiresAt).toLocaleDateString('en-IN')}.
              </Muted>
              <Button
                tone="secondary"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await revokeAbdmConsent(granted.consentId);
                    setNotice(result.message ?? result.error ?? null);
                  })
                }
              >
                Withdraw this consent
              </Button>
            </Stack>
          ) : (
            <Stack gap="sm">
              <Muted>
                With {patientName}’s consent we can pull their past reports from other providers,
                so the technician knows their conditions before a visit and your doctor sees the
                whole picture.
              </Muted>
              <Button
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await requestHealthHistory(patientId);
                    setNotice(result.message ?? result.error ?? null);
                  })
                }
              >
                Ask for consent to fetch past records
              </Button>
            </Stack>
          )}

          {notice && <p className="font-semibold">{notice}</p>}
        </Stack>
      </Card>
    );
  }

  // Awaiting the OTP for a newly initiated account.
  if (initState.ok && initState.txnId && !completeState.ok) {
    return (
      <Card>
        <form action={completeAction}>
          <Stack gap="md">
            <input type="hidden" name="patientId" value={patientId} />
            <input type="hidden" name="txnId" value={initState.txnId} />
            <input type="hidden" name="method" value={method} />

            <H3>Enter the code</H3>
            <Muted>{initState.message}</Muted>

            <Field label="Code" required error={completeState.error}>
              <Input
                name="otp"
                inputMode="numeric"
                pattern="\d{4,6}"
                maxLength={6}
                required
                autoFocus
                className="text-center font-mono tracking-[0.4em]"
              />
            </Field>

            {initState.simulated && (
              <Muted>
                ABDM is running in simulated mode — any four to six digits will be accepted.
              </Muted>
            )}

            <Submit label="Create the health account" />
          </Stack>
        </form>
      </Card>
    );
  }

  if (completeState.ok) {
    return (
      <Card tone="green">
        <Stack gap="sm">
          <H3>Linked</H3>
          <p>{completeState.message}</p>
          {completeState.abhaAddress && (
            <p className="font-mono">{completeState.abhaAddress}</p>
          )}
        </Stack>
      </Card>
    );
  }

  return (
    <Card>
      <Stack gap="md">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab('LINK')}
            aria-pressed={tab === 'LINK'}
            className={`min-h-[var(--size-touch)] flex-1 rounded-[var(--radius-control)] border-2 px-4 font-semibold ${
              tab === 'LINK'
                ? 'border-[var(--color-primary)] bg-[var(--color-primary-wash)]'
                : 'border-[var(--color-line-strong)]'
            }`}
          >
            They already have one
          </button>
          <button
            type="button"
            onClick={() => setTab('CREATE')}
            aria-pressed={tab === 'CREATE'}
            className={`min-h-[var(--size-touch)] flex-1 rounded-[var(--radius-control)] border-2 px-4 font-semibold ${
              tab === 'CREATE'
                ? 'border-[var(--color-primary)] bg-[var(--color-primary-wash)]'
                : 'border-[var(--color-line-strong)]'
            }`}
          >
            Create one for them
          </button>
        </div>

        {tab === 'LINK' ? (
          <form action={linkAction}>
            <Stack gap="md">
              <input type="hidden" name="patientId" value={patientId} />
              <Field
                label="ABHA number or address"
                required
                hint="Fourteen digits like 91-1234-5678-9012, or an address like lakshmi.iyer@abdm."
                error={linkState.error}
              >
                <Input name="abhaNumberOrAddress" required />
              </Field>
              {linkState.ok && linkState.message && (
                <p className="font-semibold text-[var(--color-green)]">{linkState.message}</p>
              )}
              <Submit label="Link this health account" />
            </Stack>
          </form>
        ) : (
          <form action={initAction}>
            <Stack gap="md">
              <input type="hidden" name="patientId" value={patientId} />
              <input type="hidden" name="method" value={method} />

              <Stack gap="sm">
                <p className="font-semibold">How would you like to verify?</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setMethod('MOBILE_OTP')}
                    aria-pressed={method === 'MOBILE_OTP'}
                    className={`min-h-[var(--size-touch)] rounded-[var(--radius-control)] border-2 px-4 font-semibold ${
                      method === 'MOBILE_OTP'
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-wash)]'
                        : 'border-[var(--color-line-strong)]'
                    }`}
                  >
                    Their mobile number
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod('AADHAAR_OTP')}
                    aria-pressed={method === 'AADHAAR_OTP'}
                    className={`min-h-[var(--size-touch)] rounded-[var(--radius-control)] border-2 px-4 font-semibold ${
                      method === 'AADHAAR_OTP'
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-wash)]'
                        : 'border-[var(--color-line-strong)]'
                    }`}
                  >
                    Their Aadhaar
                  </button>
                </div>
              </Stack>

              <Field
                label={method === 'AADHAAR_OTP' ? 'Aadhaar number' : 'Mobile number'}
                required
                hint={
                  method === 'AADHAAR_OTP'
                    ? 'The code goes to the mobile registered with Aadhaar.'
                    : 'The code goes to this number.'
                }
                error={initState.error}
              >
                <Input name="identifier" inputMode="numeric" required />
              </Field>

              <Card tone="sunken" className="p-4">
                <Muted>
                  Create this only if {patientName} wants it. Where they can answer for
                  themselves, the code should go to their phone and they should tell you it —
                  an account in someone’s name should be created by someone holding their phone.
                </Muted>
              </Card>

              <Submit label="Send the code" />
            </Stack>
          </form>
        )}
      </Stack>
    </Card>
  );
}
