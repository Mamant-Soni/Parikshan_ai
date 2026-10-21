import { prisma } from "@/lib/database/client";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/guards";
import { getVoiceConfig } from "@/lib/voice/config";
import { authorizeOwnedMessage } from "@/lib/voice/access";
import { VoiceProviderError, httpStatusForVoiceError } from "@/lib/voice/errors";
import { isSameOriginRequest, jsonVoiceError } from "@/lib/voice/http";
import { getTextToSpeechProvider } from "@/lib/voice/providers";
import { checkRateLimit, RATE_LIMIT_RULES } from "@/lib/voice/rate-limit";
import { buildSpokenText } from "@/lib/voice/spoken";
import { voiceSpeakSchema } from "@/lib/validation";
import type { Language } from "@/types/domain";

/**
 * Authenticated text-to-speech endpoint.
 *
 * The request contains a message id, not free text. The server loads that
 * assistant message only if it belongs to the signed-in user, so a valid session
 * cannot be used to synthesise arbitrary content or read another account's
 * answer. Audio is returned as a no-store stream and is never persisted.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request.headers)) {
    return jsonVoiceError("FORBIDDEN", 403);
  }

  const user = await getCurrentUser();
  if (!user) return jsonVoiceError("UNAUTHENTICATED", 401);

  const limit = checkRateLimit(
    "speak",
    user.id,
    RATE_LIMIT_RULES.speak.limit,
    RATE_LIMIT_RULES.speak.windowMs,
  );
  if (!limit.allowed) {
    return jsonVoiceError("RATE_LIMITED", 429, { retryAfterSeconds: limit.retryAfterSeconds });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonVoiceError("INVALID_REQUEST", 400);
  }
  const parsed = voiceSpeakSchema.safeParse(body);
  if (!parsed.success) return jsonVoiceError("INVALID_REQUEST", 400);

  // Ownership is enforced in SQL and re-checked explicitly for clarity.
  const message = await prisma.chatMessage.findFirst({
    where: {
      id: parsed.data.messageId,
      role: "assistant",
      profile: { userId: user.id },
    },
    select: {
      id: true,
      content: true,
      spokenText: true,
      profile: { select: { userId: true } },
    },
  });

  const access = authorizeOwnedMessage(user.id, message);
  if (!access.ok) {
    // Deliberately 404 for both "missing" and "belongs to someone else".
    return jsonVoiceError("NOT_FOUND", 404);
  }

  const config = getVoiceConfig();
  const provider = getTextToSpeechProvider(config);
  if (!provider) return jsonVoiceError("TTS_UNAVAILABLE", 503);

  const language: Language =
    parsed.data.language ?? (user.preferences?.language === "hi" ? "hi" : "en");
  // Prefer the speech text produced by the same safe pipeline that added
  // limitations (low OCR confidence, ambiguity, fallback). It is stored with
  // the message, never supplied by the caller, and re-trimmed to the current
  // limit in case configuration changed.
  const text = buildSpokenText(
    access.value.spokenText || access.value.content,
    config.maxSpeakChars,
  );
  if (!text) return jsonVoiceError("INVALID_REQUEST", 422);

  try {
    const result = await provider.synthesize({ text, language });

    await writeAuditLog({
      userId: user.id,
      action: "voice.speak",
      entityType: "ChatMessage",
      entityId: access.value.id,
      meta: {
        provider: result.provider,
        chars: text.length,
        language,
      },
    });

    return new Response(toArrayBuffer(result.audio), {
      status: 200,
      headers: {
        "content-type": result.mimeType,
        "content-length": String(result.audio.byteLength),
        "cache-control": "no-store, max-age=0",
        "content-disposition": "inline; filename=answer.mp3",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof VoiceProviderError) {
      return jsonVoiceError(error.code, httpStatusForVoiceError(error.code));
    }
    const name = (error as { name?: string }).name;
    return jsonVoiceError(name === "TimeoutError" ? "TIMEOUT" : "PROVIDER_ERROR", name === "TimeoutError" ? 504 : 502);
  }
}
