"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/database/client";
import { getCurrentUser } from "@/lib/auth/session";
import { getActiveProfile, writeAuditLog } from "@/lib/auth/guards";
import { answerQuestionSafely, getHealthAIProvider } from "@/lib/ai";
import { getAIContext, getRecentChatHistory } from "@/lib/database/queries";
import { chatAskSchema } from "@/lib/validation";
import { runAssistantTurn, type AssistantTurn } from "@/lib/voice/assistant";
import { getVoiceConfig } from "@/lib/voice/config";
import { checkRateLimit, RATE_LIMIT_RULES } from "@/lib/voice/rate-limit";
import type { ChatSource } from "@/types/domain";

/**
 * AI assistant server action.
 *
 * Security properties:
 *  • The profile is resolved from the session every time; a client cannot name
 *    another profile or family member.
 *  • The record context and conversation history are both scoped to that
 *    profile, so follow-up questions cannot widen access.
 *  • Emergency and destructive-command handling happens BEFORE any provider is
 *    called (see src/lib/voice/assistant.ts).
 *  • Rate limiting is keyed by user id, never by transcript or health data.
 *  • Only the transcript is persisted (never audio), and audit metadata never
 *    contains clinical content.
 */

export type AskAssistantResult =
  | {
      ok: true;
      answer: string;
      sources: ChatSource[];
      grounded: boolean;
      provider: string;
      isMock: boolean;
      messageId: string;
      intent: string;
      language: "en" | "hi";
      inputMode: "text" | "voice";
      confidence: AssistantTurn["confidence"];
      limitations: AssistantTurn["limitations"];
      spokenText: string;
      emergency: boolean;
      requiresConfirmation: boolean;
      numericClaims: string[];
    }
  | { ok: false; error: string; retryAfterSeconds?: number };

export async function askAssistantAction(input: unknown): Promise<AskAssistantResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "UNAUTHENTICATED" };

  const parsed = chatAskSchema.safeParse(input);
  if (!parsed.success) {
    const raw = (input as { question?: unknown } | null)?.question;
    const length = typeof raw === "string" ? raw.trim().length : 0;
    return { ok: false, error: length > 400 ? "QUESTION_TOO_LONG" : "QUESTION_TOO_SHORT" };
  }

  const limit = checkRateLimit(
    "assistant",
    user.id,
    RATE_LIMIT_RULES.assistant.limit,
    RATE_LIMIT_RULES.assistant.windowMs,
  );
  if (!limit.allowed) {
    return { ok: false, error: "RATE_LIMITED", retryAfterSeconds: limit.retryAfterSeconds };
  }

  const language = user.preferences?.language === "hi" ? "hi" : "en";
  const profile = await getActiveProfile(user.id);
  const config = getVoiceConfig();

  const [context, history] = await Promise.all([
    getAIContext(profile.id, { name: profile.name, kind: profile.kind }, language),
    getRecentChatHistory(profile.id, 6),
  ]);

  let outcome;
  try {
    outcome = await runAssistantTurn({
      question: parsed.data.question,
      inputMode: parsed.data.inputMode,
      language,
      context,
      history,
      provider: getHealthAIProvider(),
      // Reuses the existing provider fallback behaviour and reports it as a
      // limitation when a hosted model is unavailable.
      answerQuestion: (request) => answerQuestionSafely(request),
      maxSpeakChars: config.maxSpeakChars,
    });
  } catch {
    return { ok: false, error: "PROVIDER_ERROR" };
  }

  if (outcome.kind === "invalid") {
    return { ok: false, error: outcome.code };
  }

  const turn = outcome.turn;
  const [userMessage, assistantMessage] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        profileId: profile.id,
        role: "user",
        content: parsed.data.question,
      },
    }),
    prisma.chatMessage.create({
      data: {
        profileId: profile.id,
        role: "assistant",
        content: turn.content,
        sources: JSON.stringify(turn.sources),
        spokenText: turn.spokenText,
        intent: turn.intent,
        grounded: turn.grounded,
      },
    }),
  ]);

  void userMessage;

  await writeAuditLog({
    userId: user.id,
    action: "assistant.ask",
    entityType: "HealthProfile",
    entityId: profile.id,
    meta: {
      inputMode: parsed.data.inputMode,
      intent: turn.intent,
      grounded: turn.grounded,
      provider: turn.provider,
      confidence: turn.confidence,
      emergency: turn.emergency,
      requiresConfirmation: turn.requiresConfirmation,
      numericClaimCount: turn.numericClaims.length,
      voice: turn.injectionSuspicion ? "untrusted-transcript" : undefined,
    },
  });

  revalidatePath("/assistant");
  return {
    ok: true,
    answer: turn.content,
    sources: turn.sources,
    grounded: turn.grounded,
    provider: turn.provider,
    isMock: turn.isMock,
    messageId: assistantMessage.id,
    intent: turn.intent,
    language,
    inputMode: parsed.data.inputMode,
    confidence: turn.confidence,
    limitations: turn.limitations,
    spokenText: turn.spokenText,
    emergency: turn.emergency,
    requiresConfirmation: turn.requiresConfirmation,
    numericClaims: turn.numericClaims,
  };
}

export async function clearChatAction(): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const profile = await getActiveProfile(user.id);
  await prisma.chatMessage.deleteMany({ where: { profileId: profile.id } });
  await writeAuditLog({
    userId: user.id,
    action: "assistant.clear",
    entityType: "HealthProfile",
    entityId: profile.id,
  });
  revalidatePath("/assistant");
  return { ok: true };
}

/** Standalone term explainer used by the "what does this mean" chips. */
export async function explainTermAction(term: string): Promise<{ ok: boolean; explanation?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const language = user.preferences?.language === "hi" ? "hi" : "en";
  const explanation = await getHealthAIProvider().explainMedicalTerm(term, language);
  return { ok: true, explanation };
}
