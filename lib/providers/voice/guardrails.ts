/**
 * Voice agent guardrails.
 *
 * This is the highest-liability component in the product. An AI that answers
 * "my mother's sugar is 300, what should I do?" is practising medicine without
 * a licence, and both source documents forbid it explicitly: never interpret a
 * result, never suggest a medicine, never imply a diagnosis.
 *
 * The defence is three independent layers, in order of strength:
 *
 *   1. NO CAPABILITY — the agent is given no tool that can return a result
 *      value, a trend or a diagnosis. It cannot leak what it cannot fetch.
 *      That lives in ./tools.ts.
 *   2. OUTPUT GUARD — this file. Every agent utterance is scanned server-side
 *      before it is spoken, and anything that reads as clinical interpretation
 *      is replaced with a handoff.
 *   3. RED-TEAM SUITE — tests/voice-guardrails.test.ts, CI-blocking.
 *
 * A prompt is layer zero. It is necessary and it is not a control.
 */

import { brand } from '../../brand';

export type GuardCategory =
  | 'CLINICAL_INTERPRETATION'
  | 'MEDICATION_ADVICE'
  | 'DIAGNOSIS_REQUEST'
  | 'RESULT_VALUE_REQUEST'
  | 'EMERGENCY'
  | 'PROMPT_INJECTION';

export interface GuardVerdict {
  allowed: boolean;
  category?: GuardCategory;
  /** What the agent must say instead. */
  replacement?: string;
  /** True when a human ticket must be opened as well. */
  requiresHandoff: boolean;
  /** True when this is a medical emergency, which outranks everything. */
  isEmergency: boolean;
  matched?: string;
}

/**
 * Patterns are written per language rather than translated mechanically,
 * because the dangerous phrasings differ: an Indian caller is far more likely
 * to ask "sugar kitna hai" than "what is my glycated haemoglobin".
 *
 * These are intentionally over-broad. A false positive costs one unnecessary
 * transfer to a human. A false negative costs a diagnosis given by a robot.
 */
const EMERGENCY_PATTERNS: RegExp[] = [
  // English
  /\bchest\s*pain\b/i,
  /\bcan(?:'|no)?t\s*breathe\b/i,
  /\bbreathless\b/i,
  /\bunconscious\b/i,
  /\bnot\s*waking\b/i,
  /\bcollaps(?:e|ed|ing)\b/i,
  /\bstroke\b/i,
  /\bheart\s*attack\b/i,
  /\bbleeding\s*(?:heavily|a lot|non[- ]?stop)\b/i,
  /\bfits?\b|\bseizure\b|\bconvulsion\b/i,
  /\bsuicid/i,
  // Hindi / Urdu (Latin and native script)
  /सीने\s*में\s*दर्द|छाती\s*में\s*दर्द/,
  /साँस\s*नहीं|सांस\s*नहीं|बेहोश/,
  /\bseene?\s*me[ni]?\s*dard\b/i,
  /\bsaans\s*nahi\b/i,
  /\bbehosh\b/i,
  // Bengali, Marathi, Tamil, Telugu, Kannada, Malayalam, Gujarati, Punjabi
  /বুকে\s*ব্যথা|অজ্ঞান/,
  /छातीत\s*दुखत|बेशुद्ध/,
  /நெஞ்சு\s*வலி|மயக்கம்/,
  /ఛాతీ\s*నొప్పి|స్పృహ\s*లేదు/,
  /ಎದೆ\s*ನೋವು|ಪ್ರಜ್ಞೆ\s*ಇಲ್ಲ/,
  /നെഞ്ചു\s*വേദന|ബോധം\s*ഇല്ല/,
  /છાતીમાં\s*દુખાવો|બેભાન/,
  /ਛਾਤੀ\s*ਵਿੱਚ\s*ਦਰਦ|ਬੇਹੋਸ਼/,
];

const CLINICAL_INTERPRETATION_PATTERNS: RegExp[] = [
  /\bwhat\s+does\s+(?:this|that|it|my|his|her|the)\b.*\b(?:mean|indicate|show)\b/i,
  /\b(?:is|are)\s+(?:this|that|it|these|my|his|her|the)\s+.{0,40}\b(?:normal|abnormal|ok(?:ay)?|fine|bad|high|low|dangerous|serious|worrying)\b/i,
  /\bshould\s+(?:i|we)\s+(?:be\s+)?worr(?:y|ied)\b/i,
  /\bhow\s+(?:bad|serious|dangerous)\b/i,
  /\bexplain\s+(?:the\s+)?(?:report|result|value|reading)\b/i,
  /\bwhat\s+do(?:es)?\s+(?:my|his|her|the)\s+\w+\s+(?:level|count|value|reading)\b/i,
  /\bis\s+\d+(?:\.\d+)?\s*(?:mg|mmol|g\/dl|%|percent)?\s*(?:bad|high|low|normal|ok)/i,
  // Hindi / Urdu
  /(?:इसका|इसका मतलब|मतलब)\s*क्या/,
  /ठीक\s*है\s*(?:क्या|ना)?\s*\?*$/,
  /ज़्यादा\s*है|ज्यादा\s*है|कम\s*है/,
  /\bmatlab\s*kya\b/i,
  /\bkya\s*ye\s*(?:theek|thik|normal|sahi)\b/i,
  /\bkya\s*(?:zyada|jyada|kam)\s*hai\b/i,
  /\bchinta\s*ki\s*baat\b/i,
  // other Indian languages — "is it normal / what does it mean"
  /এর\s*মানে\s*কি|স্বাভাবিক\s*কি/,
  /याचा\s*अर्थ\s*काय|नॉर्मल\s*आहे\s*का/,
  /இதன்\s*அர்த்தம்|நார்மலா/,
  /దీని\s*అర్థం|నార్మల్\s*ఏనా/,
  /ಇದರ\s*ಅರ್ಥ|ನಾರ್ಮಲ್\s*ಇದೆಯಾ/,
  /ഇതിന്റെ\s*അർത്ഥം|നോർമൽ\s*ആണോ/,
  /આનો\s*અર્થ|નોર્મલ\s*છે/,
  /ਇਸਦਾ\s*ਮਤਲਬ|ਨਾਰਮਲ\s*ਹੈ/,
];

const MEDICATION_PATTERNS: RegExp[] = [
  /\bwh(?:at|ich)\s+(?:medicine|medication|tablet|drug|dose|dosage)\b/i,
  /\bshould\s+(?:i|we|he|she|they)\s+(?:take|stop|start|increase|decrease|change)\b/i,
  /\bcan\s+(?:i|we|he|she)\s+(?:stop|skip|double|halve)\b.*\b(?:tablet|medicine|dose|insulin)\b/i,
  /\bhow\s+much\s+(?:insulin|metformin|medicine)\b/i,
  /\b(?:mg|milligram)s?\s+(?:should|to take)\b/i,
  /कौन\s*सी\s*दवा|दवा\s*(?:लूँ|लू|बंद|बढ़ा)/,
  /\bkaun\s*si\s*dawa\b|\bdawa\s*(?:lu|band|badha)\b/i,
  /ఏ\s*మందు|எந்த\s*மருந்து|ಯಾವ\s*ಔಷಧ|ഏത്\s*മരുന്ന്/,
];

const DIAGNOSIS_PATTERNS: RegExp[] = [
  /\b(?:do|does)\s+(?:i|he|she|they|my\s+\w+)\s+have\b.*\b(?:diabetes|cancer|kidney|thyroid|anemia|anaemia|failure|disease|infection)\b/i,
  /\bam\s+i\s+diabetic\b/i,
  /\bis\s+(?:it|this)\s+(?:cancer|diabetes|kidney\s*failure|a\s*tumou?r)\b/i,
  /\bdiagnos(?:e|is|ed)\b/i,
  /\bwhat\s+(?:disease|illness|condition)\b/i,
  /क्या\s*(?:मुझे|उन्हें|माँ\s*को|पिता\s*को).*(?:डायबिटीज|शुगर|कैंसर|बीमारी)/,
  /\bshugar\s*hai\s*kya\b|\bdiabetes\s*hai\b/i,
];

const RESULT_VALUE_PATTERNS: RegExp[] = [
  /\b(?:what|tell\s+me|read\s+(?:out|me))\b.*\b(?:hba1c|a1c|sugar|glucose|creatinine|haemoglobin|hemoglobin|cholesterol|tsh|value|reading|number|level|count)\b/i,
  /\bmy\s+(?:hba1c|sugar|creatinine|cholesterol|tsh)\s+(?:is|was)?\b/i,
  // "Read out the report to me", "read me the report", "read the results".
  // Deliberately narrow: it must be a request to READ one, so ordinary
  // questions like "has the report come?" stay allowed.
  /\bread\s+(?:out|me|aloud)?\s*(?:the\s+|her\s+|his\s+|my\s+)?(?:report|result)/i,
  /रिपोर्ट\s*(?:पढ़|बता|सुना)/,
  /\breport\s*(?:padh|bata|suna)/i,
  /শুগার\s*কত|சர்க்கரை\s*எவ்வளவு|షుగర్\s*ఎంత|ಸಕ್ಕರೆ\s*ಎಷ್ಟು/,
];

/**
 * Callers occasionally try to talk the agent out of its own rules, and so do
 * any third parties who can get text into a conversation. Treat it as data.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /\bignore\s+(?:all\s+)?(?:previous|prior|your)\s+(?:instructions|rules|prompt)\b/i,
  /\byou\s+are\s+(?:now\s+)?a\s+doctor\b/i,
  /\bpretend\s+(?:to\s+be|you(?:'| a)re)\b.*\b(?:doctor|physician|nurse)\b/i,
  /\bfor\s+(?:testing|research|educational)\s+purposes\b.*\b(?:diagnos|prescri)/i,
  /\bdeveloper\s+mode\b/i,
  /\bsystem\s*(?:prompt|message)\s*:/i,
];

/**
 * Output-side patterns. Even with no clinical tool, a language model can still
 * volunteer an interpretation from general knowledge. This catches that.
 */
const UNSAFE_OUTPUT_PATTERNS: { pattern: RegExp; category: GuardCategory }[] = [
  { pattern: /\b(?:this|that|your|the)\s+(?:result|value|level|reading)\s+(?:is|means|indicates|suggests|shows)\b/i, category: 'CLINICAL_INTERPRETATION' },
  { pattern: /\b(?:normal|reference)\s+range\s+(?:is|for)\b/i, category: 'CLINICAL_INTERPRETATION' },
  { pattern: /\b(?:slightly|mildly|significantly|dangerously)\s+(?:high|low|elevated|raised|reduced)\b/i, category: 'CLINICAL_INTERPRETATION' },
  { pattern: /\byou\s+(?:have|may\s+have|might\s+have|likely\s+have)\b.*\b(?:diabetes|anaemia|anemia|infection|deficiency|disease)\b/i, category: 'DIAGNOSIS_REQUEST' },
  // Allows for the words people actually put in between — "continue taking
  // your usual tablet" was slipping through a tighter version of this.
  { pattern: /\b(?:take|taking|start|stop|increase|reduce|continue|keep)\b[^.]{0,40}\b(?:tablets?|medicines?|medications?|dose|dosage|insulin|metformin|pills?)\b/i, category: 'MEDICATION_ADVICE' },
  { pattern: /\b\d+\s*(?:mg|ml|units?)\b\s*(?:daily|twice|once|per day)/i, category: 'MEDICATION_ADVICE' },
  { pattern: /\b(?:nothing\s+to\s+worry|don'?t\s+worry|it'?s\s+(?:fine|normal|okay))\b.*\b(?:result|report|value|level)\b/i, category: 'CLINICAL_INTERPRETATION' },
  { pattern: /\bhba1c\s+of\s+\d/i, category: 'RESULT_VALUE_REQUEST' },
];

/**
 * Order matters. Every branch refuses and hands off, so this is not a safety
 * ordering — it decides which deflection the caller hears, and the most
 * specific intent should win.
 *
 * Interpretation sits above value-request on purpose: "what does her HbA1c
 * mean?" is a request to have something explained, not a request to have a
 * number read out, and the explanation deflection is the better answer.
 */
const CHECKS: { patterns: RegExp[]; category: GuardCategory }[] = [
  { patterns: MEDICATION_PATTERNS, category: 'MEDICATION_ADVICE' },
  { patterns: DIAGNOSIS_PATTERNS, category: 'DIAGNOSIS_REQUEST' },
  { patterns: CLINICAL_INTERPRETATION_PATTERNS, category: 'CLINICAL_INTERPRETATION' },
  { patterns: RESULT_VALUE_PATTERNS, category: 'RESULT_VALUE_REQUEST' },
  { patterns: INJECTION_PATTERNS, category: 'PROMPT_INJECTION' },
];

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) return m[0];
  }
  return null;
}

export const EMERGENCY_SCRIPT = `If this is happening right now, please call ${brand.emergencyNumber} immediately, or take them to the nearest hospital. I am not able to give medical advice. I am also alerting our coordinator to call you straight away.`;

export const DEFLECTION_SCRIPTS: Record<Exclude<GuardCategory, 'EMERGENCY'>, string> = {
  CLINICAL_INTERPRETATION: `I'm not able to explain what results mean — only a doctor can do that, and it would be wrong of me to guess. Please show the report to your physician. I'm opening a ticket now so one of our coordinators calls you back, and I can help with the appointment, the report delivery or the plan in the meantime.`,
  MEDICATION_ADVICE: `I can't advise on any medicine or dose — that has to come from the treating doctor. Please don't change anything without speaking to them. I'm asking a coordinator to call you back, and I can help with scheduling or billing right now.`,
  DIAGNOSIS_REQUEST: `I can't tell you whether someone has a condition. ${brand.name} arranges the collection and the delivery of the report; the diagnosis is the doctor's, working from the signed laboratory report. I'm arranging a callback from our coordinator.`,
  // Every deflection must end somewhere a person is waiting. A refusal with no
  // route to a human is a wall, and this one was one until a test caught it.
  RESULT_VALUE_REQUEST: `I don't have access to any test values, and I'm not able to read results out. The signed report is in the app under Reports, and your doctor is the right person to go through it with. I'm asking a coordinator to call you back so you're not left with this on your own, and I can tell you whether the report has been released and help with your next visit.`,
  PROMPT_INJECTION: `I can only help with appointments, reports delivery, plans and billing for ${brand.name}. I can't take on another role. Would you like me to book, move or explain a visit?`,
};

/** Screens what the caller said, before the agent responds. */
export function guardInput(utterance: string): GuardVerdict {
  const text = utterance.trim();
  if (!text) return { allowed: true, requiresHandoff: false, isEmergency: false };

  // Emergency outranks everything, including a question that also looks
  // clinical. Getting someone to 108 is more urgent than being careful.
  const emergency = firstMatch(text, EMERGENCY_PATTERNS);
  if (emergency) {
    return {
      allowed: false,
      category: 'EMERGENCY',
      replacement: EMERGENCY_SCRIPT,
      requiresHandoff: true,
      isEmergency: true,
      matched: emergency,
    };
  }

  for (const { patterns, category } of CHECKS) {
    const matched = firstMatch(text, patterns);
    if (matched) {
      return {
        allowed: false,
        category,
        replacement: DEFLECTION_SCRIPTS[category as Exclude<GuardCategory, 'EMERGENCY'>],
        // A prompt-injection attempt is redirected, not escalated to a human.
        requiresHandoff: category !== 'PROMPT_INJECTION',
        isEmergency: false,
        matched,
      };
    }
  }

  return { allowed: true, requiresHandoff: false, isEmergency: false };
}

/** Screens what the agent is about to say. The last line of defence. */
export function guardOutput(response: string): GuardVerdict {
  const text = response.trim();
  if (!text) return { allowed: true, requiresHandoff: false, isEmergency: false };

  for (const { pattern, category } of UNSAFE_OUTPUT_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      return {
        allowed: false,
        category,
        replacement: DEFLECTION_SCRIPTS[category as Exclude<GuardCategory, 'EMERGENCY'>],
        requiresHandoff: true,
        isEmergency: false,
        matched: m[0],
      };
    }
  }

  return { allowed: true, requiresHandoff: false, isEmergency: false };
}

/**
 * Both directions in one call, for the conversation turn handler. The output
 * guard runs even when the input looked innocent, because "how is my mother
 * doing?" is not a clinical question and "her numbers look a bit high" is a
 * clinical answer.
 */
export function guardTurn(input: {
  userUtterance: string;
  agentResponse: string;
}): GuardVerdict {
  const inbound = guardInput(input.userUtterance);
  if (!inbound.allowed) return inbound;
  return guardOutput(input.agentResponse);
}
