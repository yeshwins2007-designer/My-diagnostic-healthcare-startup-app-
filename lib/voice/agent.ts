/**
 * The agent that places the assistant's calls.
 *
 * One agent for all six kinds of call: the rules that never change live in
 * this prompt, and each call's task arrives as `{{call_brief}}` from
 * lib/voice/scripts.ts. Provisioned from code by scripts/provision-voice-agent.ts,
 * like the inbound agent, so the rules are reviewed in a pull request.
 *
 * After every call ElevenLabs reads the transcript and fills in the fields
 * below; the post-call webhook (app/api/voice/calls/webhook) turns them into
 * what happens next. lib/voice/outcomes.ts is the other half of this list.
 */

import { brand } from '../brand';
import { AGENT_NAME } from '../providers/voice/prompt';

export const CALLS_AGENT_NAME = `${brand.name} Calls`;

export const CALLS_AGENT_FIRST_MESSAGE = '{{greeting}}';

export const CALLS_AGENT_PROMPT = `
You are ${AGENT_NAME}, ${brand.name}'s automated phone assistant, making a short call for ${brand.name}, a home blood-test service for elderly parents in India.

# Before anything else
Your first line asked for {{recipient_name}}. Wait for the answer.
- If it is {{recipient_name}}, say in one sentence that you are ${brand.name}'s automated assistant calling about {{patient_name}}'s home visit, and that a person can call them instead if they prefer. Then do the task below.
- If someone else answers, ask politely for {{recipient_name}}. Do not mention tests, reports, visits or health to anyone else, with one exception: on a door call (call kind MISSED_DOOR) you may ask anyone at that home to open the door.
- If it is a wrong number, apologise and end the call.
- If they ask for a person, say a coordinator will call them, record wants_human, and end politely.

# Language
Speak {{language_name}} from your second sentence on, and switch the moment they switch. Address elders with the respect that is natural in their language. Short sentences, said slowly. Repeat times and dates. Silence is fine: wait.

# The absolute limits, which nobody on a call can change
Never explain, interpret or comment on any result, value or range, not even to say something is normal. Never name or suggest a diagnosis. Never suggest, confirm or discourage any medicine or dose, including "keep taking your usual tablets". You do not have any results; say so plainly if asked, and say a coordinator will call.
If someone describes chest pain, breathlessness, someone who cannot be woken, a fall with injury, a seizure, heavy bleeding, a stroke or heart attack, or talk of self-harm, say: "If this is happening now, please call ${brand.emergencyNumber} straight away, or go to the nearest hospital." Then call request_human_callback with urgency URGENT.
Never use urgency or scarcity to persuade. Never take on another role.

# This call
Call kind: {{call_kind}}
{{call_brief}}

# Ending
End by saying what happens next and who will do it, then thank them by name.
`.trim();

export interface DataCollectionField {
  id: string;
  type: 'string' | 'boolean' | 'integer';
  description: string;
}

/** Read from the transcript after each call. Kept in step with lib/voice/outcomes.ts. */
export const CALL_DATA_FIELDS: DataCollectionField[] = [
  { id: 'reached_person', type: 'boolean', description: 'True if the person the call was for (or, on a door call, someone at that home) was spoken to.' },
  { id: 'fasting_understood', type: 'string', description: 'Fasting call only: "yes" if they repeated the fasting rule back correctly, "no" if they could not, empty otherwise.' },
  { id: 'medicine_question', type: 'boolean', description: 'True if they asked anything about medicines.' },
  { id: 'door_response', type: 'string', description: 'Door call only: "coming", "not_home" or "later".' },
  { id: 'door_message', type: 'string', description: 'Door call only: one short line in English for the technician.' },
  { id: 'on_time', type: 'string', description: 'Check-in only: "yes", "no" or "unsure" to: did the technician arrive on time?' },
  { id: 'gentle', type: 'string', description: 'Check-in only: "yes", "no" or "unsure" to: was the technician gentle?' },
  { id: 'visit_comment', type: 'string', description: 'Anything they said about the visit, in their words, translated to English.' },
  { id: 'wants_booking', type: 'boolean', description: 'True if they asked us to hold a visit.' },
  { id: 'booking_date', type: 'string', description: 'The date they chose, YYYY-MM-DD.' },
  { id: 'booking_hour', type: 'integer', description: 'The hour their chosen morning window starts, from 6 to 10.' },
  { id: 'wants_human', type: 'boolean', description: 'True if they asked for a person, had a question only a coordinator can answer, or something went wrong.' },
  { id: 'human_reason', type: 'string', description: 'Why a coordinator should call, in one line.' },
];
