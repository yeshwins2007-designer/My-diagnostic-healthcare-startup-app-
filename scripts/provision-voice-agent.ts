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
import { AGENT_TOOLS, auditToolSurface } from '../lib/providers/voice/tools';

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
        tools: AGENT_TOOLS.map((tool) => ({
          type: 'webhook',
          name: tool.name,
          description: tool.description,
          api_schema: {
            url: `${process.env.PUBLIC_BASE_URL ?? 'https://example.invalid'}/api/voice/tool/${tool.name}`,
            method: tool.mutates ? 'POST' : 'GET',
            request_body_schema: tool.parameters,
          },
        })),
      },
      first_message: AGENT_FIRST_MESSAGE,
      language: 'en',
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

  console.log(`
Done.

Add this to .env.local:

  NEXT_PUBLIC_ELEVENLABS_AGENT_ID=${agent.agent_id}

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
