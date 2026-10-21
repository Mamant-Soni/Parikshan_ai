import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/guards";
import { getVoiceConfig, isSupportedAudioType } from "@/lib/voice/config";
import {
  VoiceProviderError,
  httpStatusForVoiceError,
} from "@/lib/voice/errors";
import { isSameOriginRequest, jsonVoiceError, jsonVoiceOk } from "@/lib/voice/http";
import { getSpeechToTextProvider } from "@/lib/voice/providers";
import { checkRateLimit, RATE_LIMIT_RULES } from "@/lib/voice/rate-limit";
import { sanitizeTranscript } from "@/lib/voice/transcript";
import type { Language } from "@/types/domain";

/**
 * Authenticated speech-to-text endpoint.
 *
 * Raw audio exists only in this request's memory: it is never written to disk,
 * the database or logs, and the buffer is discarded when the provider returns.
 *
 * Security: session required, same-origin check, per-user rate limit, MIME/size
 * limits, and transcript sanitisation before it is returned to the client. The
 * transcript is still treated as untrusted by the assistant action.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isSameOriginRequest(request.headers)) {
    return jsonVoiceError("FORBIDDEN", 403);
  }

  const user = await getCurrentUser();
  if (!user) return jsonVoiceError("UNAUTHENTICATED", 401);

  const limit = checkRateLimit(
    "transcribe",
    user.id,
    RATE_LIMIT_RULES.transcribe.limit,
    RATE_LIMIT_RULES.transcribe.windowMs,
  );
  if (!limit.allowed) {
    return jsonVoiceError("RATE_LIMITED", 429, { retryAfterSeconds: limit.retryAfterSeconds });
  }

  const config = getVoiceConfig();
  const maxBytes = config.maxAudioMb * 1024 * 1024;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes + 64 * 1024) {
    return jsonVoiceError("AUDIO_TOO_LARGE", 413, { maxAudioMb: config.maxAudioMb });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonVoiceError("INVALID_REQUEST", 400);
  }

  const entry = form.get("audio");
  if (!entry || typeof entry === "string") {
    return jsonVoiceError("INVALID_REQUEST", 400);
  }
  const file = entry as File;

  if (!file.size) return jsonVoiceError("EMPTY_TRANSCRIPT", 422);
  if (file.size > maxBytes) {
    return jsonVoiceError("AUDIO_TOO_LARGE", 413, { maxAudioMb: config.maxAudioMb });
  }
  if (!isSupportedAudioType(file.type)) {
    return jsonVoiceError("UNSUPPORTED_AUDIO", 415);
  }

  const language: Language = form.get("language") === "hi" ? "hi" : "en";
  const provider = getSpeechToTextProvider(config);
  if (!provider) {
    return jsonVoiceError("PROVIDER_NOT_CONFIGURED", 503);
  }

  try {
    const audio = new Uint8Array(await file.arrayBuffer());
    const result = await provider.transcribe({
      audio,
      mimeType: file.type,
      language,
    });

    const sanitized = sanitizeTranscript(result.transcript, {
      maxChars: config.maxQuestionChars,
    });
    if (!sanitized.ok) {
      return jsonVoiceError(
        sanitized.code === "TRANSCRIPT_TOO_LONG"
          ? "TRANSCRIPT_TOO_LONG"
          : sanitized.code === "TRANSCRIPT_EMPTY"
            ? "EMPTY_TRANSCRIPT"
            : "TRANSCRIPT_REJECTED",
        422,
        sanitized.text ? { editableText: sanitized.text } : {},
      );
    }

    // Audit only metadata — never the transcript or audio.
    await writeAuditLog({
      userId: user.id,
      action: "voice.transcribe",
      meta: {
        provider: result.provider,
        bytes: file.size,
        language,
        mimeType: file.type,
      },
    });

    return jsonVoiceOk({
      transcript: sanitized.text,
      truncated: sanitized.truncated,
      suspicion: sanitized.suspicion,
      provider: result.provider,
      language,
    });
  } catch (error) {
    if (error instanceof VoiceProviderError) {
      return jsonVoiceError(error.code, httpStatusForVoiceError(error.code));
    }
    const name = (error as { name?: string }).name;
    return jsonVoiceError(name === "TimeoutError" ? "TIMEOUT" : "PROVIDER_ERROR", name === "TimeoutError" ? 504 : 502);
  }
}
