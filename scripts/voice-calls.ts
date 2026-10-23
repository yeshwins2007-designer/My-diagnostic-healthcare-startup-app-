/**
 * The assistant's calls: plan what is due, dial it, and tidy up.
 *
 * Run every five minutes (cron, or a platform scheduled job):
 *   npm run calls:run
 *
 * Planning is idempotent (one call per purpose), so running it more often,
 * or twice by accident, never rings anyone twice. Event calls (a door nobody
 * answers, a report released) do not wait for this: they dial at once.
 */

import { dialDueCalls, planCalls, sweepSilentCalls } from '../lib/voice/scheduler';
import { expireBookingRequests } from '../lib/voice/requests';
import { db } from '../lib/db';

async function main() {
  const now = new Date();
  const planned = await planCalls(now);
  const silent = await sweepSilentCalls(now);
  const dialled = await dialDueCalls(now);
  const expired = await expireBookingRequests(now);
  console.log(
    `Calls: planned ${planned.fasting} fasting, ${planned.checkins} check-ins, ${planned.monthly} monthly, ${planned.nudges} reminders; ` +
      `dialled ${dialled}; ${silent} never reported back; ${expired} phone requests expired.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
