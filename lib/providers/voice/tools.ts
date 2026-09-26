/**
 * The tools the voice agent is allowed to call.
 *
 * This list IS the first guardrail. There is deliberately no tool here that
 * returns a result value, a reference range, a trend or a diagnosis — so even
 * a jailbroken model with a perfectly crafted prompt has nothing clinical to
 * fetch. `get_report_status` returns *whether* a report exists and has been
 * released, never what is in it.
 *
 * Any future tool added to this file must be justified against that rule.
 */

import { z } from 'zod';

export interface AgentToolSpec {
  name: string;
  description: string;
  /** JSON Schema handed to the ElevenLabs agent. */
  parameters: Record<string, unknown>;
  /** Zod schema used to validate the call server-side before executing it. */
  input: z.ZodTypeAny;
  /** True when the tool changes state and therefore needs the caller identified. */
  mutates: boolean;
}

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = [],
) => ({ type: 'object', properties, required, additionalProperties: false });

export const AGENT_TOOLS: AgentToolSpec[] = [
  {
    name: 'get_next_visit',
    description:
      'Returns the date, promised time window, technician first name and fasting requirement for the caller’s next scheduled home visit. Returns nothing clinical.',
    parameters: objectSchema({
      patient_name: {
        type: 'string',
        description: 'Name of the patient the caller is asking about, as they said it.',
      },
    }),
    input: z.object({ patient_name: z.string().min(1).max(120) }),
    mutates: false,
  },
  {
    name: 'get_technician_eta',
    description:
      'Returns how many minutes away the technician is for a visit happening today, and whether they are running inside the promised window.',
    parameters: objectSchema({
      booking_reference: {
        type: 'string',
        description: 'Booking reference such as SS-7K3F2A, if the caller has it.',
      },
    }),
    input: z.object({ booking_reference: z.string().max(20).optional() }),
    mutates: false,
  },
  {
    name: 'get_fasting_instructions',
    description:
      'Returns the plain-language fasting instructions for an upcoming visit: what time to stop eating, and that water and regular medicines continue unless the doctor said otherwise.',
    parameters: objectSchema({
      booking_reference: { type: 'string', description: 'Booking reference, if known.' },
    }),
    input: z.object({ booking_reference: z.string().max(20).optional() }),
    mutates: false,
  },
  {
    name: 'reschedule_visit',
    description:
      'Moves an upcoming home visit to a different date and morning window. Only offers windows that are actually available on that technician’s route.',
    parameters: objectSchema(
      {
        booking_reference: { type: 'string', description: 'Booking reference to move.' },
        preferred_date: { type: 'string', description: 'Requested date in YYYY-MM-DD.' },
        preferred_window: {
          type: 'string',
          description: 'Requested window, one of: 6:30-7:30, 7:30-8:30, 8:30-9:30.',
        },
      },
      ['booking_reference', 'preferred_date'],
    ),
    input: z.object({
      booking_reference: z.string().min(3).max(20),
      preferred_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      preferred_window: z.string().max(20).optional(),
    }),
    mutates: true,
  },
  {
    name: 'get_report_status',
    description:
      'Says whether a report has been signed by the pathologist and released to the family, and when. NEVER returns any result value, range or interpretation.',
    parameters: objectSchema({
      booking_reference: { type: 'string', description: 'Booking reference, if known.' },
    }),
    input: z.object({ booking_reference: z.string().max(20).optional() }),
    mutates: false,
  },
  {
    name: 'get_plan_and_billing',
    description:
      'Returns the family’s current plan name, what it includes, the monthly amount and the next billing date. No payment instrument details.',
    parameters: objectSchema({}),
    input: z.object({}),
    mutates: false,
  },
  {
    name: 'raise_support_ticket',
    description:
      'Opens a support ticket for a human coordinator. Use for complaints, billing disputes, and anything the agent cannot answer.',
    parameters: objectSchema(
      {
        category: {
          type: 'string',
          enum: ['SCHEDULING', 'BILLING', 'REPORT_DELIVERY', 'COMPLAINT', 'CLINICAL_HANDOFF'],
        },
        subject: { type: 'string', description: 'One line summarising the request.' },
        detail: { type: 'string', description: 'What the caller said, in their own words.' },
      },
      ['category', 'subject'],
    ),
    input: z.object({
      category: z.enum([
        'SCHEDULING',
        'BILLING',
        'REPORT_DELIVERY',
        'COMPLAINT',
        'CLINICAL_HANDOFF',
      ]),
      subject: z.string().min(3).max(160),
      detail: z.string().max(2000).optional(),
    }),
    mutates: true,
  },
  {
    name: 'request_human_callback',
    description:
      'Asks a human coordinator to call the family back. Always use this the moment the caller asks anything about what a result means, a medicine, or a diagnosis.',
    parameters: objectSchema(
      {
        reason: { type: 'string', description: 'Why a human is needed.' },
        urgency: { type: 'string', enum: ['NORMAL', 'HIGH', 'URGENT'] },
      },
      ['reason'],
    ),
    input: z.object({
      reason: z.string().min(3).max(500),
      urgency: z.enum(['NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
    }),
    mutates: true,
  },
];

export const AGENT_TOOL_NAMES = AGENT_TOOLS.map((t) => t.name);

/**
 * Enforced at the call boundary. A tool name the agent invents — or one an
 * attacker talks it into naming — is refused rather than looked up.
 */
export function isPermittedTool(name: string): boolean {
  return AGENT_TOOL_NAMES.includes(name);
}

export function getToolSpec(name: string): AgentToolSpec | undefined {
  return AGENT_TOOLS.find((t) => t.name === name);
}

/**
 * Guard for the tools list itself, run as a unit test. If someone later adds a
 * `get_result_value` tool, this fails loudly rather than shipping quietly.
 */
const FORBIDDEN_TOOL_SUBSTRINGS = [
  'result_value',
  'lab_value',
  'reference_range',
  'interpret',
  'diagnos',
  'medication',
  'prescri',
  'dose',
  'trend',
];

/**
 * The exact set of tools that has been reviewed against the no-clinical-data
 * rule. Adding a tool without adding it here fails the audit — a reviewer has
 * to make a deliberate decision rather than a tool arriving by accident.
 */
export const REVIEWED_TOOL_ALLOWLIST = [
  'get_next_visit',
  'get_technician_eta',
  'get_fasting_instructions',
  'reschedule_visit',
  'get_report_status',
  'get_plan_and_billing',
  'raise_support_ticket',
  'request_human_callback',
] as const;

export function auditToolSurface(): { safe: boolean; offenders: string[] } {
  const offenders: string[] = [];

  for (const tool of AGENT_TOOLS) {
    // Names only. Descriptions are excluded on purpose: several of them
    // legitimately contain "value" and "diagnosis" precisely because they say
    // the tool never returns one.
    const name = tool.name.toLowerCase();
    if (FORBIDDEN_TOOL_SUBSTRINGS.some((bad) => name.includes(bad))) {
      offenders.push(`${tool.name}: name suggests it exposes clinical data`);
    }
    if (!(REVIEWED_TOOL_ALLOWLIST as readonly string[]).includes(tool.name)) {
      offenders.push(`${tool.name}: not in the reviewed allowlist`);
    }
  }

  return { safe: offenders.length === 0, offenders };
}
