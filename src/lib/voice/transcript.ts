import type { Language } from "@/types/domain";

/**
 * Voice transcripts are untrusted input.
 *
 * They arrive from a browser API, a third-party speech provider, or an attacker
 * who can call the endpoint directly. Everything here treats the string as data:
 * it is normalised, length-limited, screened for prompt-injection attempts, and
 * never interpreted as a command. The assistant server action repeats every
 * check — client-side validation is only a convenience.
 */

export const MAX_QUESTION_CHARS = 400;
export const MIN_QUESTION_CHARS = 2;

export type TranscriptSanitizeResult =
  | {
      ok: true;
      text: string;
      truncated: boolean;
      suspicion: boolean;
      injection: boolean;
    }
  | {
      ok: false;
      code: "TRANSCRIPT_EMPTY" | "TRANSCRIPT_TOO_LONG" | "TRANSCRIPT_REJECTED";
      /** A truncated, cleaned value the UI may offer for editing. */
      text?: string;
    };

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/i,
  /(system|developer)\s+(prompt|message|instructions?)/i,
  /you\s+are\s+now\s+(a|an|the)\s+/i,
  /(reveal|show|print|list)\s+(me\s+)?(another|other|all)\s+(patient|user|family|profile)/i,
  /(reveal|show|print|leak)\s+(the\s+)?(system|hidden)\s+(prompt|instructions?)/i,
  /(bypass|override|disable)\s+(the\s+)?(safety|authorization|permission|access)\s+(rules?|checks?|controls?)/i,
  /पिछले\s+(निर्देश|आदेश).*(अनदेखा|भूल)/,
  /(दूसरे|अन्य)\s+(मरीज़|उपयोगकर्ता|यूज़र)\s+का\s+(रिकॉर्ड|डेटा)/,
  /सिस्टम\s+(प्रॉम्प्ट|निर्देश)/i,
];

export function detectPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

function hasMeaningfulCharacters(text: string): boolean {
  // Letters in any script (including Devanagari) or digits.
  return [...text].filter((char) => /[\p{L}\p{N}]/u.test(char)).length >= MIN_QUESTION_CHARS;
}

export function sanitizeTranscript(
  raw: unknown,
  options: { maxChars?: number } = {},
): TranscriptSanitizeResult {
  const maxChars = Math.max(MIN_QUESTION_CHARS, options.maxChars ?? MAX_QUESTION_CHARS);
  if (typeof raw !== "string") return { ok: false, code: "TRANSCRIPT_REJECTED" };

  const cleaned = raw
    .normalize("NFKC")
    // Strip control characters, zero-width joiners and bidi overrides.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!hasMeaningfulCharacters(cleaned)) {
    return { ok: false, code: "TRANSCRIPT_EMPTY", text: "" };
  }

  if (cleaned.length > maxChars) {
    return {
      ok: false,
      code: "TRANSCRIPT_TOO_LONG",
      text: cleaned.slice(0, maxChars).trim(),
    };
  }

  const injection = detectPromptInjection(cleaned);
  return { ok: true, text: cleaned, truncated: false, suspicion: injection, injection };
}

// ── Emergency recognition ───────────────────────────────────────────────────

const EMERGENCY_PATTERNS: { id: string; pattern: RegExp }[] = [
  {
    id: "chest_pain",
    pattern:
      /(?<![\p{L}\p{N}])(chest pain|chest pressure|pain in (the )?chest|सीने में दर्द|सीने में जकड़न|छाती में दर्द)(?![\p{L}\p{N}])/iu,
  },
  {
    id: "breathing",
    pattern:
      /(?<![\p{L}\p{N}])(can(no|')t breathe|cannot breathe|difficulty breathing|severe shortness of breath|गंभीर सांस|सांस नहीं आ|saans nahi)(?![\p{L}\p{N}])/iu,
  },
  {
    id: "stroke",
    pattern:
      /(?<![\p{L}\p{N}])(stroke|face droop|drooping face|slurred speech|sudden weakness|लकवा|चेहरा टेढ़ा|बोली लड़खड़ा)(?![\p{L}\p{N}])/iu,
  },
  {
    id: "bleeding",
    pattern:
      /(?<![\p{L}\p{N}])(severe bleeding|bleeding heavily|heavy bleeding|bleeding won'?t stop|बहुत खून|खून बह रहा)(?![\p{L}\p{N}])/iu,
  },
  {
    id: "unconscious",
    pattern:
      /(?<![\p{L}\p{N}])(unconscious|passed out|fainted|not responding|बेहोश|होश नहीं)(?![\p{L}\p{N}])/iu,
  },
  {
    id: "seizure",
    pattern: /(?<![\p{L}\p{N}])(seizure|convulsion|convulsing|दौरा|मिर्गी)(?![\p{L}\p{N}])/iu,
  },
  {
    id: "self_harm",
    pattern:
      /(?<![\p{L}\p{N}])(suicid\w*|kill myself|self[- ]harm|end my life|आत्महत्या|खुद को मार|जान दे)(?![\p{L}\p{N}])/iu,
  },
  {
    id: "overdose",
    pattern:
      /(?<![\p{L}\p{N}])(overdose|poisoning|took too many (pills|tablets)|ज़हर|जहर खा)(?![\p{L}\p{N}])/iu,
  },
  {
    id: "anaphylaxis",
    pattern:
      /(?<![\p{L}\p{N}])(anaphylaxis|throat (is )?swelling|swollen throat|गला सूज|गला बंद)(?![\p{L}\p{N}])/iu,
  },
];

const NEGATION_BEFORE = /\b(no|not|without|never|denies?|negative for)\b[^.!?।]{0,28}$/i;

/**
 * Devanagari has no `\b`, so negation that follows the symptom
 * ("सीने में दर्द नहीं है") is handled with an explicit window instead.
 */
const NEGATION_AFTER = /^[^.!?।]{0,14}(नहीं|नही)/u;

export function detectEmergency(text: string): { emergency: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const entry of EMERGENCY_PATTERNS) {
    const match = entry.pattern.exec(text);
    if (!match) continue;
    const before = text.slice(Math.max(0, match.index - 40), match.index).trim();
    // "I have no chest pain" is not an emergency.
    if (NEGATION_BEFORE.test(before)) continue;
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 20);
    if (NEGATION_AFTER.test(after)) continue;
    reasons.push(entry.id);
  }
  return { emergency: reasons.length > 0, reasons };
}

// ── Sensitive actions ───────────────────────────────────────────────────────

export type SensitiveActionKind =
  | "DELETE_RECORDS"
  | "SHARE_RECORDS"
  | "CLEAR_HISTORY"
  | "ACCOUNT_ACTION";

const SENSITIVE_PATTERNS: { kind: SensitiveActionKind; pattern: RegExp }[] = [
  {
    kind: "ACCOUNT_ACTION",
    pattern:
      /\b(delete|close|deactivate|sign out of|log out of)\b[^.!?।]{0,40}\b(account|profile)\b/i,
  },
  {
    kind: "CLEAR_HISTORY",
    pattern: /\b(clear|delete|erase|reset|remove)\b[^.!?।]{0,40}\b(chat|conversation|history|messages)\b/i,
  },
  {
    kind: "SHARE_RECORDS",
    pattern:
      /\b(share|send|forward|email|whatsapp|export|upload to)\b[^.!?।]{0,60}\b(record|records|report|reports|result|results|prescription|documents?|data)\b/i,
  },
  {
    kind: "DELETE_RECORDS",
    pattern:
      /\b(delete|erase|remove|destroy|wipe)\b[^.!?।]{0,60}\b(record|records|report|reports|history|data|profile)\b/i,
  },
  {
    kind: "ACCOUNT_ACTION",
    pattern: /(खाता|अकाउंट|प्रोफ़ाइल)[^।.!?]{0,30}(हटाओ|बंद करो|डिलीट)/,
  },
  {
    kind: "CLEAR_HISTORY",
    pattern: /(बातचीत|चैट|इतिहास)[^।.!?]{0,30}(साफ़|हटाओ|मिटाओ|डिलीट)/,
  },
  {
    kind: "SHARE_RECORDS",
    pattern: /(साझा|शेयर|भेज|ईमेल|व्हाट्सएप|व्हाट्सऐप)[^।.!?]{0,40}(रिकॉर्ड|रिपोर्ट|दस्तावेज़|जानकारी|डेटा)/,
  },
  {
    // Hindi often puts the action after the object: "मेरी रिपोर्ट ईमेल कर दो".
    kind: "SHARE_RECORDS",
    pattern:
      /(रिकॉर्ड|रिपोर्ट|दस्तावेज़|जानकारी|डेटा)[^।.!?]{0,40}(साझा|शेयर|भेज|ईमेल|व्हाट्सएप|व्हाट्सऐप|फ़ॉरवर्ड|फॉरवर्ड)/,
  },
  {
    kind: "DELETE_RECORDS",
    pattern: /(रिकॉर्ड|रिपोर्ट|डेटा)[^।.!?]{0,30}(हटाओ|मिटाओ|डिलीट|साफ़)/,
  },
];

/**
 * Detects imperative requests to perform a destructive or sharing action.
 * The assistant NEVER executes these actions — it returns a refusal that points
 * the user to the existing confirmation UI. This function exists so the refusal
 * is explicit and testable instead of relying on the language model's mood.
 */
export function detectSensitiveAction(text: string): SensitiveActionKind | null {
  for (const entry of SENSITIVE_PATTERNS) {
    if (entry.pattern.test(text)) return entry.kind;
  }
  return null;
}

// ── Verification-claim sanitisation ─────────────────────────────────────────

const VERIFICATION_CLAIM_PATTERNS: RegExp[] = [
  /\b(your|the)\s+(doctor|clinician|physician|hospital)\s+(has\s+)?(verified|confirmed|approved|reviewed|checked)\b[^.!?।]*[.!?।]?/gi,
  /\b(clinically|medically)\s+verified\b[^.!?।]*[.!?।]?/gi,
  /\b(doctor|clinician|physician)[- ]approved\b[^.!?।]*[.!?।]?/gi,
  /(आपके\s+)?डॉक्टर\s+ने[^।.!?]{0,40}(सत्यापित|पुष्टि|जाँच)\s*(कर\s*दी|किया)?[।.!?]?/gi,
];

const VERIFICATION_DISCLAIMER =
  "This answer was generated from your uploaded records. It has not been verified by a clinician.";

export function sanitizeVerificationClaims(text: string): { text: string; replaced: boolean } {
  let replaced = false;
  let output = text;
  for (const pattern of VERIFICATION_CLAIM_PATTERNS) {
    output = output.replace(pattern, () => {
      replaced = true;
      return VERIFICATION_DISCLAIMER;
    });
  }
  return { text: output, replaced };
}

// ── Language helpers ────────────────────────────────────────────────────────

export function normalizeLanguage(value: unknown): Language {
  return value === "hi" ? "hi" : "en";
}

const FOLLOW_UP_START =
  /^(and|what about|how about|and what|uska|uski|uske|उसका|उसकी|उसके|उससे|और|तो)(?![\p{L}\p{N}])/iu;
const FOLLOW_UP_REFERENCE =
  /(?<![\p{L}\p{N}])(before (that|this)|previous (one|reading|report)|पिछली|पहले वाला|उससे पहले)(?![\p{L}\p{N}])/iu;

export function isFollowUpQuestion(text: string): boolean {
  const trimmed = text.trim();
  return FOLLOW_UP_START.test(trimmed) || FOLLOW_UP_REFERENCE.test(trimmed);
}
