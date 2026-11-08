/**
 * What the assistant knows, and is told to do, on each call.
 *
 * The brief is the only thing the agent learns about the family for that
 * call, and it never contains a result, a value or a diagnosis: the agent
 * cannot say what it was never given. Facts are written out here, in code
 * that can be reviewed, rather than looked up by the model mid-call.
 *
 * Briefs are in English; the agent speaks to the listener in their own
 * language (`language_name`), which the multilingual model does well. Only
 * the opening line is fixed, and it is a greeting and the person's name in
 * their language: nothing is said about a visit until we know who answered.
 */

import { brand } from '../brand';
import { isLocale, localeMeta, type Locale } from '../i18n/locales';
import type { VoiceCallKind } from '../enums';
import { INDIA, spokenDate, spokenTime } from './time';

export interface CallContext {
  kind: VoiceCallKind;
  recipientRole: 'PATIENT' | 'FAMILY';
  recipientName: string;
  locale: string;
  timeZone: string;
  patientName: string;
  technicianName?: string;
  visit?: { windowStart: Date; windowEnd: Date; fastingHours: number };
  /** The visit date of a released report. */
  reportVisitDate?: Date;
  /** Plain facts for the monthly update, one per line, no clinical content. */
  monthlyFacts?: string[];
  due?: {
    dueDate: Date;
    lastVisit: Date;
    proposed: Date;
    proposedWindowEnd: Date;
  };
}

export interface CallScript {
  /** Spoken first, verbatim: a greeting and the person's name. */
  greeting: string;
  /** The task for this call, handed to the agent as a dynamic variable. */
  brief: string;
  languageName: string;
  /** One line for the call log. */
  headline: string;
}

const GREETINGS: Record<Locale, string> = {
  en: 'Hello',
  hi: 'Namaste',
  bn: 'Nomoskar',
  mr: 'Namaskar',
  te: 'Namaskaram',
  ta: 'Vanakkam',
  kn: 'Namaskara',
  gu: 'Namaste',
  ml: 'Namaskaram',
  pa: 'Sat Sri Akal',
  ur: 'Assalamu alaikum',
  as: 'Nomoskar',
};
/** Languages where "ji" after a name is the ordinary courtesy. */
const JI: Locale[] = ['hi', 'mr', 'gu', 'pa', 'ur'];

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function greetingFor(name: string, locale: string): string {
  const key: Locale = isLocale(locale) ? locale : 'en';
  const who = JI.includes(key) ? `${firstName(name)} ji` : firstName(name);
  return key === 'en' ? `Hello, is that ${firstName(name)}?` : `${GREETINGS[key]}, ${who}?`;
}

/** Visits happen in India: say so when the listener is somewhere else. */
function visitTime(at: Date, listenerZone: string) {
  return `${spokenTime(at, INDIA)}${listenerZone === INDIA ? '' : ' India time'}`;
}

/** The last meal: the fasting hours before the window opens, to the half hour. */
export function lastMealTime(windowStart: Date, fastingHours: number): Date {
  const t = windowStart.getTime() - fastingHours * 3_600_000;
  return new Date(Math.floor(t / 1_800_000) * 1_800_000);
}

export function buildCallScript(ctx: CallContext): CallScript {
  const languageName = localeMeta(isLocale(ctx.locale) ? ctx.locale : 'en').english;
  const patient = firstName(ctx.patientName);
  const tech = ctx.technicianName ? firstName(ctx.technicianName) : 'our technician';
  const greeting = greetingFor(ctx.recipientName, ctx.locale);
  const lines: string[] = [];
  let headline = '';

  switch (ctx.kind) {
    case 'FASTING_PREP': {
      const v = ctx.visit!;
      const meal = lastMealTime(v.windowStart, v.fastingHours);
      headline = `Fasting call to ${firstName(ctx.recipientName)} for ${spokenDate(v.windowStart, INDIA)}`;
      lines.push(
        `You are calling ${ctx.recipientRole === 'PATIENT' ? patient : `${firstName(ctx.recipientName)}, who looks after ${patient}`}, the evening before ${patient}'s home blood test.`,
        'Facts you may say, and nothing else about the visit:',
        `- The visit is tomorrow, ${spokenDate(v.windowStart, INDIA)}, between ${visitTime(v.windowStart, ctx.timeZone)} and ${visitTime(v.windowEnd, ctx.timeZone)}. ${tech} will come.`,
        `- The test needs ${v.fastingHours} hours without food. The last meal is by ${spokenTime(meal, INDIA)} tonight. After that, nothing to eat until the sample is taken.`,
        '- Plain water is fine, and helps.',
        'What to do:',
        '1. Explain the fasting rule in two or three short sentences.',
        `2. Ask them to say it back in their own words: what time is the last meal, and what is allowed in the morning.${ctx.recipientRole === 'PATIENT' ? '' : ` Ask them to pass it on to ${patient} tonight.`}`,
        '3. If they have it right, thank them warmly and repeat the time of the visit. If not, explain once more, more simply, and ask again. If they are still unsure, say a coordinator will call this evening. Record fasting_understood.',
        '4. If they ask about any medicine, do not advise either way. Say a coordinator will call about medicines today, and record medicine_question.',
        '5. If they want another day or time, say a coordinator will call to move it, and record wants_human.',
      );
      break;
    }
    case 'MISSED_DOOR': {
      const toPatient = ctx.recipientRole === 'PATIENT';
      headline = `Door not answered: calling ${firstName(ctx.recipientName)}`;
      lines.push(
        toPatient
          ? `${tech} from ${brand.name} is at ${patient}'s door right now for the blood test, and nobody has answered.`
          : `${tech} from ${brand.name} is at ${patient}'s door right now for the blood test. ${patient} has not answered the door, and we could not reach them by phone.`,
        'What to do, in under a minute:',
        toPatient
          ? '1. Ask if they, or someone at home, can open the door now.'
          : `1. Ask if they can reach ${patient} or someone at home, or whether ${patient} is away today.`,
        `2. Record door_response: "coming" if someone will open the door, "not_home" if no one is there today, "later" if they ask for another time.`,
        `3. Record door_message: one short line for ${tech}, in English, such as "Coming down in five minutes, use the side gate".`,
        `4. If no one can come, say a coordinator will call to arrange another visit.`,
        toPatient
          ? '5. Keep it calm and brief.'
          : `5. Do not suggest anything has happened to ${patient}. If they are worried for ${patient}'s safety, say a coordinator will call straight away, record wants_human, and if they describe an emergency follow the emergency rule.`,
      );
      break;
    }
    case 'POST_VISIT_CHECKIN': {
      headline = `After-visit check-in with ${firstName(ctx.recipientName)}`;
      lines.push(
        `${tech} took ${patient}'s blood sample ${ctx.visit ? `on ${spokenDate(ctx.visit.windowStart, INDIA)}` : 'today'}.`,
        'Ask two questions, one at a time, and nothing else:',
        `1. Did ${tech} arrive on time? Record on_time as yes, no or unsure.`,
        `2. Was ${tech} gentle, especially with the needle? Record gentle as yes, no or unsure.`,
        'If they want to say more, listen, and record it in their words as visit_comment.',
        'If something went wrong, apologise once, say a coordinator will call, and record wants_human.',
        'The results are not ready and you do not have them. Thank them by name and end the call.',
      );
      break;
    }
    case 'REPORT_READY': {
      headline = `Report-ready call to ${firstName(ctx.recipientName)}`;
      lines.push(
        `${patient}'s report from the visit on ${spokenDate(ctx.reportVisitDate ?? new Date(), INDIA)} has been signed by the laboratory and is in the ${brand.name} app, under Reports.`,
        'Say only that it is ready, and where to find it.',
        `A coordinator will call within 24 hours to go through it with them. Say so.`,
        'You do not have the results. Never say anything about what is in the report, not even that it is normal or that there is nothing to worry about. If asked, say the coordinator will go through it, and record wants_human.',
      );
      break;
    }
    case 'MONTHLY_UPDATE': {
      headline = `Monthly update for ${firstName(ctx.recipientName)}`;
      lines.push(
        `This is the monthly update for ${firstName(ctx.recipientName)}, who looks after ${patient}. Keep it under a minute.`,
        'Facts to say, plainly, in this order:',
        ...(ctx.monthlyFacts ?? []).map((f) => `- ${f}`),
        'Then ask if they have any questions. Anything about results or medicines goes to a coordinator: record wants_human.',
        'Never comment on any result.',
      );
      break;
    }
    case 'DUE_NUDGE': {
      const d = ctx.due!;
      headline = `Due reminder for ${patient}`;
      lines.push(
        `${patient}'s next monthly blood test is due on ${spokenDate(d.dueDate, INDIA)}. The last visit was on ${spokenDate(d.lastVisit, INDIA)}.`,
        `Their usual slot is ${spokenDate(d.proposed, INDIA).split(',')[0]} morning. Offer ${spokenDate(d.proposed, INDIA)}, between ${visitTime(d.proposed, ctx.timeZone)} and ${visitTime(d.proposedWindowEnd, ctx.timeZone)}.`,
        'If they say yes, say: "I have noted it. Please confirm it in the app, where you choose the tests and pay. We hold it for two days." Record wants_booking, booking_date (YYYY-MM-DD) and booking_hour (the hour the window starts, from 6 to 10).',
        'If they want a different day or time, take the one they prefer and record it the same way.',
        'If they say no or not now, thank them and end. Never push, and never say a slot might go.',
      );
      break;
    }
  }

  return { greeting, brief: lines.join('\n'), languageName, headline };
}
