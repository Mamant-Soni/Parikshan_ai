import type { AnswerConfidence, ChatSource, Language } from "@/types/domain";
import type {
  AIContext,
  ConversationTurn,
  HealthAIProvider,
  QuestionRequest,
  QuestionResponse,
} from "@/lib/ai/types";
import { createTranslator } from "@/lib/i18n";
import {
  assessGrounding,
  enrichSources,
  findUnsupportedNumericClaims,
  type AnswerLimitation,
} from "./grounding";
import { buildSpokenText } from "./spoken";
import {
  detectEmergency,
  detectSensitiveAction,
  sanitizeTranscript,
  sanitizeVerificationClaims,
  type SensitiveActionKind,
} from "./transcript";

/**
 * The single server-side turn pipeline used by typed AND voice questions.
 *
 * Order matters:
 *   1. normalise/validate the untrusted question,
 *   2. escalate emergencies before any model call,
 *   3. refuse destructive/sharing commands before any model call,
 *   4. ask the record-grounded provider (with profile-scoped history),
 *   5. rebuild sources from the database context,
 *   6. verify every numeric claim against that context,
 *   7. attach explicit limitations and a speech-friendly version.
 */

export type AssistantTurn = {
  content: string;
  sources: ChatSource[];
  grounded: boolean;
  intent: string;
  provider: string;
  isMock: boolean;
  confidence: AnswerConfidence;
  limitations: AnswerLimitation[];
  spokenText: string;
  emergency: boolean;
  requiresConfirmation: boolean;
  sensitiveKind: SensitiveActionKind | null;
  injectionSuspicion: boolean;
  numericClaims: string[];
  fallbackReason?: string;
};

export type InvalidQuestionCode =
  | "QUESTION_TOO_SHORT"
  | "TRANSCRIPT_TOO_LONG"
  | "TRANSCRIPT_REJECTED";

export type AssistantOutcome =
  | { kind: "invalid"; code: InvalidQuestionCode }
  | { kind: "turn"; turn: AssistantTurn };

export type AssistantTurnInput = {
  question: string;
  inputMode: "text" | "voice";
  language: Language;
  context: AIContext;
  history: ConversationTurn[];
  provider: HealthAIProvider;
  /** Injectable so the action can reuse answerQuestionSafely and tests can fake it. */
  answerQuestion?: (request: QuestionRequest) => Promise<QuestionResponse>;
  maxSpeakChars?: number;
};

export async function runAssistantTurn(input: AssistantTurnInput): Promise<AssistantOutcome> {
  const sanitized = sanitizeTranscript(input.question);
  if (!sanitized.ok) {
    if (sanitized.code === "TRANSCRIPT_EMPTY") {
      return { kind: "invalid", code: "QUESTION_TOO_SHORT" };
    }
    if (sanitized.code === "TRANSCRIPT_TOO_LONG") {
      return { kind: "invalid", code: "TRANSCRIPT_TOO_LONG" };
    }
    return { kind: "invalid", code: "TRANSCRIPT_REJECTED" };
  }

  const question = sanitized.text;
  const t = createTranslator(input.language);
  const maxSpeakChars = input.maxSpeakChars ?? 1500;
  const base = {
    provider: "safety-rules",
    isMock: true,
    injectionSuspicion: sanitized.suspicion,
    numericClaims: [] as string[],
  };

  // 1. Emergency escalation — never wait for a model or a record lookup.
  if (detectEmergency(question).emergency) {
    const content = t("voice.emergencyAnswer");
    return {
      kind: "turn",
      turn: {
        ...base,
        content,
        sources: [],
        grounded: false,
        intent: "emergency",
        confidence: "none",
        limitations: [],
        spokenText: buildSpokenText(content, maxSpeakChars),
        emergency: true,
        requiresConfirmation: false,
        sensitiveKind: null,
      },
    };
  }

  // 2. Sensitive actions can never be executed by a voice command.
  const sensitiveKind = detectSensitiveAction(question);
  if (sensitiveKind) {
    const content = t("voice.confirmationAnswer");
    return {
      kind: "turn",
      turn: {
        ...base,
        content,
        sources: [],
        grounded: false,
        intent: "confirmation_required",
        confidence: "none",
        limitations: [],
        spokenText: buildSpokenText(content, maxSpeakChars),
        emergency: false,
        requiresConfirmation: true,
        sensitiveKind,
      },
    };
  }

  // 3. Ask the existing authenticated AI provider with profile-scoped history.
  const ask = input.answerQuestion ?? input.provider.answerQuestion.bind(input.provider);
  const response = await ask({
    context: input.context,
    question,
    language: input.language,
    history: input.history,
  });

  let content = sanitizeVerificationClaims(response.content).text;
  let sources = enrichSources(response.sources, input.context);
  let grounded = response.grounded;
  let intent = response.intent;

  // 4. Verify numeric claims against the records the server actually loaded.
  const numericClaims = findUnsupportedNumericClaims(content, input.context);
  if (numericClaims.length > 0) {
    const assessed = assessGrounding({
      question,
      context: input.context,
      response: { ...response, content, sources },
      language: input.language,
      numericClaims,
    });
    content = t("voice.ungroundedAnswer");
    sources = [];
    grounded = false;
    intent = "ungrounded_rejected";
    return {
      kind: "turn",
      turn: {
        ...base,
        content,
        sources,
        grounded,
        intent,
        provider: response.provider,
        isMock: response.isMock,
        confidence: "low",
        limitations: assessed.limitations,
        spokenText: buildSpokenText(
          [content, ...assessed.limitations.map((item) => item.message)].join(" "),
          maxSpeakChars,
        ),
        emergency: false,
        requiresConfirmation: false,
        sensitiveKind: null,
        numericClaims,
        fallbackReason: response.fallbackReason,
      },
    };
  }

  const assessment = assessGrounding({
    question,
    context: input.context,
    response: { ...response, content, sources },
    language: input.language,
    numericClaims: [],
  });

  const spokenLimitations = assessment.limitations
    .filter((item) => item.code !== "NOT_IN_RECORDS")
    .map((item) => item.message);

  return {
    kind: "turn",
    turn: {
      ...base,
      content,
      sources,
      grounded,
      intent,
      provider: response.provider,
      isMock: response.isMock,
      confidence: assessment.confidence,
      limitations: assessment.limitations,
      spokenText: buildSpokenText(
        [content, ...spokenLimitations].join(" "),
        maxSpeakChars,
      ),
      emergency: false,
      requiresConfirmation: false,
      sensitiveKind: null,
      numericClaims: [],
      fallbackReason: response.fallbackReason,
    },
  };
}
