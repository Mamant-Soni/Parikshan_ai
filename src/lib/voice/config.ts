import type { Language } from "@/types/domain";

/**
 * Speech provider configuration.
 *
 * The provider is an environment choice, not a vendor baked into the browser
 * bundle. Defaults are deliberately `browser`: no key is needed, nothing is
 * uploaded by this app, and the feature still works offline.
 *
 * Secrets never leave this module. Only `VoicePublicConfig` (a separate type
 * with no key/model fields) is passed to client components.
 */

export type SpeechProviderId = "browser" | "openai" | "none";

export type VoiceConfigNote =
  | "STT_CREDENTIALS_MISSING"
  | "TTS_CREDENTIALS_MISSING"
  | "STT_PROVIDER_UNKNOWN"
  | "TTS_PROVIDER_UNKNOWN";

export type VoiceConfig = {
  sttProvider: SpeechProviderId;
  ttsProvider: SpeechProviderId;
  requestedSttProvider: string;
  requestedTtsProvider: string;
  serverSttAvailable: boolean;
  serverTtsAvailable: boolean;
  openAI: {
    apiKey: string;
    baseUrl: string;
    sttModel: string;
    ttsModel: string;
    ttsVoiceEn: string;
    ttsVoiceHi: string;
  };
  maxRecordingSeconds: number;
  maxAudioMb: number;
  maxQuestionChars: number;
  maxSpeakChars: number;
  notes: VoiceConfigNote[];
};

/** Everything the browser is allowed to know. No credentials, no model names. */
export type VoicePublicConfig = {
  sttProvider: SpeechProviderId;
  ttsProvider: SpeechProviderId;
  serverSttAvailable: boolean;
  serverTtsAvailable: boolean;
  maxRecordingSeconds: number;
  maxAudioMb: number;
  maxQuestionChars: number;
  maxSpeakChars: number;
  languages: Language[];
  audioRetention: "none";
  transcriptRetention: "chat-history";
  notes: VoiceConfigNote[];
};

const PROVIDER_VALUES: SpeechProviderId[] = ["browser", "openai", "none"];

function normalizeProvider(value: string | undefined, fallback: SpeechProviderId) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if ((PROVIDER_VALUES as string[]).includes(normalized)) {
    return normalized as SpeechProviderId;
  }
  return null;
}

function numberEnv(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function getVoiceConfig(env: Record<string, string | undefined> = process.env): VoiceConfig {
  const notes: VoiceConfigNote[] = [];
  const requestedSttProvider = (env.VOICE_STT_PROVIDER ?? "browser").trim() || "browser";
  const requestedTtsProvider = (env.VOICE_TTS_PROVIDER ?? "browser").trim() || "browser";

  let sttProvider = normalizeProvider(requestedSttProvider, "browser");
  let ttsProvider = normalizeProvider(requestedTtsProvider, "browser");
  if (sttProvider === null) {
    notes.push("STT_PROVIDER_UNKNOWN");
    sttProvider = "browser";
  }
  if (ttsProvider === null) {
    notes.push("TTS_PROVIDER_UNKNOWN");
    ttsProvider = "browser";
  }

  const apiKey = (env.VOICE_OPENAI_API_KEY || env.OPENAI_API_KEY || "").trim();
  const baseUrl = (env.VOICE_OPENAI_BASE_URL || env.OPENAI_BASE_URL || "https://api.openai.com/v1")
    .trim()
    .replace(/\/$/, "");
  const hasKey = apiKey.length > 0;

  const serverSttAvailable = sttProvider === "openai" && hasKey;
  const serverTtsAvailable = ttsProvider === "openai" && hasKey;

  if (sttProvider === "openai" && !hasKey) {
    notes.push("STT_CREDENTIALS_MISSING");
    sttProvider = "browser";
  }
  if (ttsProvider === "openai" && !hasKey) {
    notes.push("TTS_CREDENTIALS_MISSING");
    ttsProvider = "browser";
  }

  return {
    sttProvider,
    ttsProvider,
    requestedSttProvider,
    requestedTtsProvider,
    serverSttAvailable,
    serverTtsAvailable,
    openAI: {
      apiKey,
      baseUrl,
      sttModel: (env.VOICE_STT_MODEL || "whisper-1").trim(),
      ttsModel: (env.VOICE_TTS_MODEL || "tts-1").trim(),
      ttsVoiceEn: (env.VOICE_TTS_VOICE_EN || env.VOICE_TTS_VOICE || "alloy").trim(),
      ttsVoiceHi: (env.VOICE_TTS_VOICE_HI || env.VOICE_TTS_VOICE || "shimmer").trim(),
    },
    maxRecordingSeconds: numberEnv(env.VOICE_MAX_RECORDING_SECONDS, 45, 10, 120),
    maxAudioMb: numberEnv(env.VOICE_MAX_AUDIO_MB, 8, 1, 25),
    maxQuestionChars: numberEnv(env.VOICE_MAX_QUESTION_CHARS, 400, 40, 400),
    maxSpeakChars: numberEnv(env.VOICE_MAX_SPEAK_CHARS, 1500, 200, 4000),
    notes,
  };
}

export function getVoicePublicConfig(env: Record<string, string | undefined> = process.env): VoicePublicConfig {
  const config = getVoiceConfig(env);
  return {
    sttProvider: config.sttProvider,
    ttsProvider: config.ttsProvider,
    serverSttAvailable: config.serverSttAvailable,
    serverTtsAvailable: config.serverTtsAvailable,
    maxRecordingSeconds: config.maxRecordingSeconds,
    maxAudioMb: config.maxAudioMb,
    maxQuestionChars: config.maxQuestionChars,
    maxSpeakChars: config.maxSpeakChars,
    languages: ["en", "hi"],
    audioRetention: "none",
    transcriptRetention: "chat-history",
    notes: config.notes,
  };
}

export function ttsVoiceForLanguage(config: VoiceConfig, language: Language): string {
  return language === "hi" ? config.openAI.ttsVoiceHi : config.openAI.ttsVoiceEn;
}

export const SUPPORTED_AUDIO_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/m4a",
  "audio/aac",
] as const;

export function isSupportedAudioType(mimeType: string): boolean {
  const normalized = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  return normalized.startsWith("audio/") && (
    SUPPORTED_AUDIO_TYPES as readonly string[]
  ).includes(normalized);
}
