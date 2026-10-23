import { declineBookingRequest } from '@/app/actions/calls';
import { describeRequestedSlot } from '@/lib/voice/requests';
import { ButtonLink, Card, H2, Stack } from '@/components/ui';
import { CallTile } from '@/components/call-icons';

export interface PhoneRequest {
  id: string;
  who: string;
  patientId: string | null;
  source: string;
  date: string;
  hour: number | null;
  tests: string;
  addressNote: string;
}

/**
 * Visits asked for on the phone, waiting for the family: a parent who just
 * called and said the day, or a "yes" to the monthly reminder. One tap
 * opens booking with that day and window already filled in; nothing was
 * booked or charged until then.
 */
export function PhoneRequests({ requests }: { requests: PhoneRequest[] }) {
  return (
    <Stack gap="sm">
      {requests.map((r) => {
        const params = new URLSearchParams({ request: r.id });
        if (r.patientId) params.set('patient', r.patientId);
        if (r.date) params.set('date', r.date);
        if (r.hour) params.set('hour', String(r.hour));
        return (
          <Card key={r.id} data-phone-request>
            <div className="flex items-start gap-4">
              <CallTile name="phone" size={40} />
              <Stack gap="sm" className="min-w-0 flex-1">
                <H2 className="text-h3">
                  {r.source === 'DUE_NUDGE' ? `You asked us to hold a visit for ${r.who}` : `${r.who} asked for a visit by phone`}
                </H2>
                <p className="text-[var(--color-ink-soft)]">
                  {describeRequestedSlot(r.date, r.hour)}
                  {r.tests && <>. “{r.tests}”</>}
                </p>
                {r.addressNote && <p className="text-small">New address said on the call: {r.addressNote}</p>}
                <div className="flex flex-wrap items-center gap-3">
                  <ButtonLink href={`/caregiver/book?${params}`}>Confirm and choose tests</ButtonLink>
                  <form action={declineBookingRequest.bind(null, r.id)}>
                    <button type="submit" className="inline-flex min-h-11 items-center font-semibold underline">
                      Not needed
                    </button>
                  </form>
                </div>
              </Stack>
            </div>
          </Card>
        );
      })}
    </Stack>
  );
}
