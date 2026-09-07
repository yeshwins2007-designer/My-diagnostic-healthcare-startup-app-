'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import {
  receiveSpecimen,
  rejectSpecimen,
  uploadResults,
  type LabActionState,
} from '@/app/actions/lab';
import {
  Button,
  Card,
  Field,
  H2,
  H3,
  Input,
  Muted,
  Select,
  Stack,
} from '@/components/ui';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" full disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

export function LabIntakePanel({
  pendingReports,
  defaultPathologistName,
  defaultPathologistReg,
}: {
  pendingReports: { bookingId: string; reference: string; patientName: string; testCodes: string[] }[];
  defaultPathologistName: string;
  defaultPathologistReg: string;
}) {
  const [barcode, setBarcode] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(pendingReports[0]?.bookingId ?? '');

  const [resultState, resultAction] = useActionState<LabActionState, FormData>(
    uploadResults,
    { ok: false },
  );
  const [rejectState, rejectAction] = useActionState<LabActionState, FormData>(
    rejectSpecimen,
    { ok: false },
  );

  const chosen = pendingReports.find((r) => r.bookingId === selected);

  return (
    <Stack gap="lg">
      <Card>
        <Stack gap="md">
          <H2 className="text-[var(--text-h3)]">Intake desk</H2>
          <Muted>
            Scan or type the barcode as it arrives. Two identifiers are printed on every vial;
            check both against the manifest before accepting.
          </Muted>
          <div className="flex flex-wrap items-end gap-3">
            <Input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="SPC-XXXXXX"
              className="min-w-56 flex-1 font-mono uppercase"
            />
            <Button
              disabled={pending || !barcode}
              onClick={() =>
                startTransition(async () => {
                  const result = await receiveSpecimen(barcode);
                  setNotice(result.message ?? null);
                  if (result.ok) setBarcode('');
                })
              }
            >
              Accept for processing
            </Button>
          </div>
          {notice && <p className="font-semibold">{notice}</p>}
        </Stack>
      </Card>

      {pendingReports.length > 0 && (
        <Card>
          <form action={resultAction}>
            <Stack gap="md">
              <H3>Upload results</H3>
              <Muted>
                The report is signed by your pathologist here. It does not reach the family until
                a SwasthaSetu coordinator has verified that the identifiers on the report match
                the physical sample — that check is permanent, not a launch precaution.
              </Muted>

              <Field label="Booking" required>
                <Select
                  name="bookingId"
                  required
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {pendingReports.map((r) => (
                    <option key={r.bookingId} value={r.bookingId}>
                      {r.reference} — {r.patientName}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Values"
                required
                hint={
                  chosen
                    ? `Format: CODE=value, separated by |. Codes for this booking: ${chosen.testCodes.join(', ')}`
                    : 'Format: CODE=value|CODE=value'
                }
              >
                <Input
                  name="values"
                  required
                  placeholder={
                    chosen
                      ? chosen.testCodes.map((c) => `${c}=`).join('|')
                      : 'HBA1C=6.2|GLU_F=94'
                  }
                  className="font-mono"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Signing pathologist" required>
                  <Input
                    name="pathologistName"
                    defaultValue={defaultPathologistName}
                    required
                  />
                </Field>
                <Field label="Council registration" required>
                  <Input
                    name="pathologistReg"
                    defaultValue={defaultPathologistReg}
                    required
                  />
                </Field>
              </div>

              {resultState.reason && (
                <div className="rounded-[var(--radius-control)] border-2 border-[var(--color-red)] bg-[var(--color-red-wash)] p-4">
                  <p className="font-semibold">{resultState.reason}</p>
                  <p className="text-[var(--text-small)]">{resultState.remedy}</p>
                </div>
              )}
              {resultState.message && (
                <p
                  className={
                    resultState.ok
                      ? 'font-semibold text-[var(--color-green)]'
                      : 'font-semibold text-[var(--color-red)]'
                  }
                >
                  {resultState.message}
                </p>
              )}

              <Submit label="Sign and submit for verification" />
            </Stack>
          </form>
        </Card>
      )}

      <Card tone="sunken">
        <form action={rejectAction}>
          <Stack gap="md">
            <H3>Reject a sample</H3>
            <Muted>
              Haemolysed, insufficient, clotted, mislabelled — say so. A rejection triggers a
              free recollection within 24 hours and a founder call automatically. There is no
              argument about whose fault it was.
            </Muted>
            <Field label="Specimen id" required>
              <Input name="specimenId" required className="font-mono" />
            </Field>
            <Field label="Reason" required>
              <Input name="reason" required placeholder="Haemolysed — cannot be processed" />
            </Field>
            {rejectState.message && <p className="font-semibold">{rejectState.message}</p>}
            <Submit label="Record the rejection" />
          </Stack>
        </form>
      </Card>
    </Stack>
  );
}
