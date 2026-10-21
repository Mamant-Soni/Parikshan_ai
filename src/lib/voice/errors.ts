import type { TranslationKey } from "@/lib/i18n";

/**
 * Voice error vocabularies.
 *
 * The same codes are used by the browser hook, the API routes and the server
 * action so a microphone denial, an expired session, an empty recording and a
 * provider outage never collapse into one generic "something went wrong".
 */
export const VOICE_ERROR_CODES = [
  "UNSUPPORTED_BROWSER",
  "PERMISSION_DENIED",
  "NO_MICROPHONE",
  "MICROPHONE_BUSY",
  "NO_SPEECH",
  "EMPTY_TRANSCRIPT",
  "TRANSCRIPT_TOO_LONG",
  "TRANSCRIPT_REJECTED",
  "LANGUAGE_UNSUPPORTED",
  "NETWORK_ERROR",
  "TIMEOUT",
  "CANCELLED",
  "RATE_LIMITED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "INVALID_REQUEST",
  "AUDIO_TOO_LARGE",
  "UNSUPPORTED_AUDIO",
  "PROVIDER_NOT_CONFIGURED",
  "PROVIDER_AUTH",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_ERROR",
  "TTS_UNAVAILABLE",
  "QUESTION_TOO_SHORT",
  "GENERIC",
] as const;

export type VoiceErrorCode = (typeof VOICE_ERROR_CODES)[number];

/** Safe, non-clinical error type for server-side speech providers. */
export class VoiceProviderError extends Error {
  readonly code: Extract<
    VoiceErrorCode,
    "PROVIDER_NOT_CONFIGURED" | "PROVIDER_AUTH" | "PROVIDER_RATE_LIMITED" | "PROVIDER_ERROR"
  >;
  readonly status?: number;

  constructor(
    code: VoiceProviderError["code"],
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = "VoiceProviderError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Maps a browser exception or a `SpeechRecognition` error string to a code.
 * Browser APIs are inconsistent, so both a DOMException-like object and the
 * Web Speech API's kebab-case strings are accepted.
 */
export function classifySpeechError(error: unknown): VoiceErrorCode {
  if (!error) return "GENERIC";

  if (typeof error === "string") {
    switch (error) {
      case "not-allowed":
      case "service-not-allowed":
        return "PERMISSION_DENIED";
      case "no-speech":
        return "NO_SPEECH";
      case "audio-capture":
        return "NO_MICROPHONE";
      case "network":
        return "NETWORK_ERROR";
      case "aborted":
        return "CANCELLED";
      case "language-not-supported":
        return "LANGUAGE_UNSUPPORTED";
      default:
        return "PROVIDER_ERROR";
    }
  }

  const candidate = error as { name?: string; code?: string | number };
  const name = String(candidate.name ?? "").toLowerCase();
  const code = String(candidate.code ?? "").toLowerCase();

  if (name === "notallowederror" || name === "permissiondeniederror" || name === "securityerror") {
    return "PERMISSION_DENIED";
  }
  if (name === "notfounderror" || name === "devicesnotfounderror") return "NO_MICROPHONE";
  if (name === "notreadableerror" || name === "trackstarterror") return "MICROPHONE_BUSY";
  if (name === "networkerror") return "NETWORK_ERROR";
  if (name === "timeouterror") return "TIMEOUT";
  if (name === "aborterror") return "CANCELLED";

  if (code === "permission-denied" || code === "not-allowed") return "PERMISSION_DENIED";
  if (code === "no-speech") return "NO_SPEECH";
  if (code === "network") return "NETWORK_ERROR";
  return "GENERIC";
}

export function httpStatusForVoiceError(code: VoiceErrorCode): number {
  switch (code) {
    case "UNAUTHENTICATED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "INVALID_REQUEST":
    case "EMPTY_TRANSCRIPT":
    case "TRANSCRIPT_REJECTED":
    case "QUESTION_TOO_SHORT":
    case "TRANSCRIPT_TOO_LONG":
      return 422;
    case "LANGUAGE_UNSUPPORTED":
      return 422;
    case "AUDIO_TOO_LARGE":
      return 413;
    case "UNSUPPORTED_AUDIO":
      return 415;
    case "RATE_LIMITED":
    case "PROVIDER_RATE_LIMITED":
      return 429;
    case "PROVIDER_NOT_CONFIGURED":
    case "TTS_UNAVAILABLE":
      return 503;
    case "TIMEOUT":
      return 504;
    case "PROVIDER_AUTH":
    case "PROVIDER_ERROR":
      return 502;
    default:
      return 400;
  }
}

/** Dictionary key for a user-facing message. Never built from provider text. */
export function voiceErrorTranslationKey(code: VoiceErrorCode): TranslationKey {
  switch (code) {
    case "UNSUPPORTED_BROWSER":
      return "voice.unsupportedTitle";
    case "PERMISSION_DENIED":
      return "voice.permissionDeniedTitle";
    case "NO_MICROPHONE":
      return "voice.noMicrophone";
    case "MICROPHONE_BUSY":
      return "voice.noMicrophone";
    case "NO_SPEECH":
    case "EMPTY_TRANSCRIPT":
      return "voice.noSpeech";
    case "TRANSCRIPT_TOO_LONG":
    case "QUESTION_TOO_SHORT":
      return "voice.tooLong";
    case "TRANSCRIPT_REJECTED":
      return "voice.transcriptRejected";
    case "LANGUAGE_UNSUPPORTED":
      return "voice.languageUnsupported";
    case "NETWORK_ERROR":
      return "voice.networkError";
    case "TIMEOUT":
      return "voice.timeout";
    case "RATE_LIMITED":
    case "PROVIDER_RATE_LIMITED":
      return "voice.rateLimited";
    case "PROVIDER_NOT_CONFIGURED":
    case "TTS_UNAVAILABLE":
      return "voice.serverUnavailable";
    case "PROVIDER_AUTH":
    case "PROVIDER_ERROR":
      return "voice.providerError";
    case "UNAUTHENTICATED":
    case "FORBIDDEN":
    case "NOT_FOUND":
      return "voice.transcriptRejected";
    case "AUDIO_TOO_LARGE":
    case "UNSUPPORTED_AUDIO":
    case "INVALID_REQUEST":
      return "voice.transcriptRejected";
    case "CANCELLED":
      return "voice.ready";
    default:
      return "voice.genericError";
  }
}

export function isVoiceErrorCode(value: unknown): value is VoiceErrorCode {
  return typeof value === "string" && (VOICE_ERROR_CODES as readonly string[]).includes(value);
}
