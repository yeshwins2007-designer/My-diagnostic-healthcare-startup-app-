/**
 * Creates (or updates) the ElevenLabs conversational agent.
 *
 * The agent is provisioned from code rather than clicked together in a
 * dashboard, because its prompt, its language list and — most importantly —
 * its tool surface are safety-critical. A guardrail that lives only in a web
 * console cannot be reviewed in a pull request, and cannot be restored after
 * someone edits it at midnight.
 *
 * Note what this script does NOT do: it does not register any tool that can
 * return a result value, a trend or a diagnosis. That is the first and
 * strongest guardrail — the agent cannot leak what it has no way to fetch —
 * and `auditToolSurface()` fails the test suite if it ever drifts.
 *
 * Run:  ELEVENLABS_API_KEY=... npm run provision:voice
 */

import {
  AGENT_FIRST_MESSAGE,
  AGENT_LANGUAGES,
  AGENT_NAME,
  AGENT_PROMPT,
  KNOWLEDGE_BASE_DOCUMENTS,
} from '../lib/providers/voice/prompt';
import { AGENT_TOOLS, auditToolSurface, type AgentToolSpec } from '../lib/providers/voice/tools';
import { CALL_DATA_FIELDS, CALLS_AGENT_FIRST_MESSAGE, CALLS_AGENT_NAME, CALLS_AGENT_PROMPT } from '../lib/voice/agent';

const API = 'https://api.elevenlabs.io/v1';

function requireKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    console.error(`
ELEVENLABS_API_KEY is not set.

  export ELEVENLABS_API_KEY=sk_...
  npm run provision:voice

Without it the application still runs — the voice assistant falls back to a
scripted simulator that goes through exactly the same guardrails, so the
refusal behaviour is real in a demo rather than mocked.
`);
    process.exit(1);
  }
  return key;
}

async function call<T>(path: string, key: string, body?: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs ${method} ${path} failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as T;
}

async function main() {
  // Refuse to provision an agent whose tool surface has drifted. Better to
  // fail here than to publish a phone number that can discuss results.
  const audit = auditToolSurface();
  if (!audit.safe) {
    console.error('\nRefusing to provision: the tool surface failed its safety audit.\n');
    for (const offender of audit.offenders) console.error(`  - ${offender}`);
    console.error(
      '\nNo tool may return a result value, a trend or a diagnosis. Fix lib/providers/voice/tools.ts.\n',
    );
    process.exit(1);
  }

  const key = requireKey();

  // The tools answer from the family's own records, so they must reach the
  // real server, and refuse anyone without the shared secret.
  const base = (process.env.PUBLIC_BASE_URL ?? process.env.PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const toolSecret = process.env.ELEVENLABS_TOOL_SECRET;
  if (!base || !toolSecret) {
    console.error(`
Set PUBLIC_APP_URL (the live https address) and ELEVENLABS_TOOL_SECRET
(generate one: openssl rand -hex 32, and set the same value on the server)
before provisioning: the agent's tools call the app, and the app refuses
any call without the secret.
`);
    process.exit(1);
  }
  // Who is calling travels with every tool call: the number they rang from on
  // the phone line, or a signed session in the app (lib/voice/answers.ts).
  const webhookTool = (tool: AgentToolSpec) => ({
    type: 'webhook',
    name: tool.name,
    description: tool.description,
    api_schema: {
      url: `${base}/api/voice/tool/${tool.name}?caller={{system__caller_id}}&session={{caller_session}}`,
      method: tool.mutates ? 'POST' : 'GET',
      request_headers: { 'x-medwyn-tool-secret': toolSecret },
      ...(tool.mutates ? { request_body_schema: tool.parameters } : { query_params_schema: tool.parameters }),
    },
  });

  console.log(`Provisioning "${AGENT_NAME}"…`);
  console.log(`  languages: ${AGENT_LANGUAGES.join(', ')}`);
  console.log(`  tools:     ${AGENT_TOOLS.length} (none can return a clinical value)`);

  const existing = await call<{ agents: { agent_id: string; name: string }[] }>(
    `/convai/agents?page_size=100`,
    key,
    undefined,
    'GET',
  ).catch(() => ({ agents: [] }));

  const already = existing.agents?.find((a) => a.name === AGENT_NAME);

  const conversationConfig = {
    agent: {
      prompt: {
        prompt: AGENT_PROMPT,
        // Tools are declared here so the agent can only ever call these.
        tools: AGENT_TOOLS.map(webhookTool),
      },
      first_message: AGENT_FIRST_MESSAGE,
      language: 'en',
      dynamic_variables: { dynamic_variable_placeholders: { caller_session: '' } },
    },
    tts: { model_id: 'eleven_multilingual_v2' },
    // Auto-detect, so a caller who opens in Tamil is answered in Tamil.
    language_presets: Object.fromEntries(
      AGENT_LANGUAGES.filter((l) => l !== 'en').map((l) => [l, { overrides: null }]),
    ),
  };

  const agent = already
    ? await call<{ agent_id: string }>(
        `/convai/agents/${already.agent_id}`,
        key,
        { name: AGENT_NAME, conversation_config: conversationConfig },
        'PATCH',
      ).then(() => ({ agent_id: already.agent_id }))
    : await call<{ agent_id: string }>('/convai/agents/create', key, {
        name: AGENT_NAME,
        conversation_config: conversationConfig,
      });

  console.log(`  ${already ? 'updated' : 'created'}: ${agent.agent_id}`);

  // Knowledge base: plans, logistics, policy and escalation. Deliberately no
  // clinical content whatsoever — there is nothing here for the agent to
  // reason from about a result.
  for (const doc of KNOWLEDGE_BASE_DOCUMENTS) {
    try {
      await call('/convai/knowledge-base/text', key, { name: doc.name, text: doc.text });
      console.log(`  knowledge base: ${doc.name}`);
    } catch (error) {
      console.warn(
        `  knowledge base: ${doc.name} — skipped (${error instanceof Error ? error.message.slice(0, 80) : 'failed'})`,
      );
    }
  }

  // The agent that places the assistant's calls (lib/voice). Same limits,
  // one tool (a person, when asked for), and the fields read from every call
  // afterwards to decide what happens next (lib/voice/outcomes.ts).
  const callsConfig = {
    agent: {
      prompt: {
        prompt: CALLS_AGENT_PROMPT,
        tools: AGENT_TOOLS.filter((t) => t.name === 'request_human_callback').map(webhookTool),
      },
      first_message: CALLS_AGENT_FIRST_MESSAGE,
      language: 'en',
      dynamic_variables: {
        dynamic_variable_placeholders: {
          caller_session: '',
          voice_call_id: '',
          call_kind: '',
          greeting: 'Hello?',
          recipient_name: '',
          patient_name: '',
          language_name: 'English',
          call_brief: '',
        },
      },
    },
    tts: { model_id: 'eleven_multilingual_v2' },
    language_presets: conversationConfig.language_presets,
  };
  const platformSettings = {
    data_collection: Object.fromEntries(
      CALL_DATA_FIELDS.map((f) => [f.id, { type: f.type, description: f.description }]),
    ),
  };
  const existingCalls = existing.agents?.find((a) => a.name === CALLS_AGENT_NAME);
  const callsAgent = existingCalls
    ? await call<{ agent_id: string }>(
        `/convai/agents/${existingCalls.agent_id}`,
        key,
        { name: CALLS_AGENT_NAME, conversation_config: callsConfig, platform_settings: platformSettings },
        'PATCH',
      ).then(() => ({ agent_id: existingCalls.agent_id }))
    : await call<{ agent_id: string }>('/convai/agents/create', key, {
        name: CALLS_AGENT_NAME,
        conversation_config: callsConfig,
        platform_settings: platformSettings,
      });
  console.log(`  ${existingCalls ? 'updated' : 'created'}: ${callsAgent.agent_id} (${CALLS_AGENT_NAME})`);

  console.log(`
Done.

Add these to the server's environment:

  NEXT_PUBLIC_ELEVENLABS_AGENT_ID=${agent.agent_id}
  ELEVENLABS_CALLS_AGENT_ID=${callsAgent.agent_id}

For the assistant's own calls, two more steps in the ElevenLabs dashboard:
  1. Phone numbers: connect your Twilio or SIP number, assign the
     "${AGENT_NAME}" agent to it for incoming calls, and set its id as
     ELEVENLABS_PHONE_NUMBER_ID (and ELEVENLABS_PHONE_PROVIDER=sip_trunk
     if it is a SIP trunk). Show the number to families as
     ASSISTANT_PHONE_NUMBER.
  2. Settings > Webhooks: add a post-call webhook to
     ${base}/api/voice/calls/webhook (transcription and call initiation
     failure events), and set its secret as ELEVENLABS_WEBHOOK_SECRET.
Then schedule \`npm run calls:run\` every five minutes.

Then restart the dev server. The in-app assistant will switch from the
simulator to the live agent, and every turn will still pass through the
server-side output guard in app/api/voice/turn/route.ts before anything is
spoken — the live agent is guarded exactly as the simulator is.
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
