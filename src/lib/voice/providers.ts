import type { Language } from "@/types/domain";
import { VoiceProviderError } from "./errors";
import { ttsVoiceForLanguage, type VoiceConfig } from "./config";

/**
 * Speech provider abstractions.
 *
 * The browser providers live in `use-voice-assistant.ts`; these are the
 * server-side providers. A new vendor is added by implementing one of the two
 * interfaces and registering it below — no UI code changes and no vendor SDK in
 * the browser bundle.
 *
 * Keys are read from the server environment only. Request bodies, audio and
 * transcripts are never logged.
 */

export type SttInput = {
  audio: Uint8Array;
  mimeType: string;
  language: Language;
  durationMs?: number;
};

export type SttResult = {
  transcript: string;
  provider: string;
  confidence?: number;
};

export type TtsInput = {
  text: string;
  language: Language;
};

export type TtsResult = {
  audio: Uint8Array;
  mimeType: string;
  provider: string;
};

export interface SpeechToTextProvider {
  readonly id: string;
  readonly label: string;
  transcribe(input: SttInput): Promise<SttResult>;
}

export interface TextToSpeechProvider {
  readonly id: string;
  readonly label: string;
  synthesize(input: TtsInput): Promise<TtsResult>;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function extensionFor(mimeType: string): string {
  const normalized = mimeType.split(";")[0]?.trim().toLowerCase();
  switch (normalized) {
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/mpeg":
      return "mp3";
    case "audio/mp4":
    case "audio/m4a":
      return "m4a";
    case "audio/ogg":
      return "ogg";
    default:
      return "webm";
  }
}

function authHeaders(apiKey: string, baseUrl: string): Record<string, string> {
  if (baseUrl.includes(".openai.azure.com")) return { "api-key": apiKey };
  return { authorization: `Bearer ${apiKey}` };
}

function withAzureApiVersion(url: string, baseUrl: string): string {
  if (!baseUrl.includes(".openai.azure.com")) return url;
  if (url.includes("?")) return url;
  return `${url}?api-version=2024-06-01`;
}

function providerFailure(response: Response, operation: string): never {
  if (response.status === 401 || response.status === 403) {
    throw new VoiceProviderError("PROVIDER_AUTH", `${operation} credentials were rejected`, response.status);
  }
  if (response.status === 429) {
    throw new VoiceProviderError("PROVIDER_RATE_LIMITED", `${operation} rate limit reached`, response.status);
  }
  throw new VoiceProviderError("PROVIDER_ERROR", `${operation} failed`, response.status);
}

export class OpenAICompatibleSttProvider implements SpeechToTextProvider {
  readonly id = "openai";
  readonly label = "OpenAI-compatible speech recognition";

  constructor(private readonly config: VoiceConfig) {}

  async transcribe(input: SttInput): Promise<SttResult> {
    if (!this.config.openAI.apiKey) {
      throw new VoiceProviderError("PROVIDER_NOT_CONFIGURED", "Speech-to-text is not configured");
    }

    const form = new FormData();
    form.append(
      "file",
      new Blob([toArrayBuffer(input.audio)], { type: input.mimeType }),
      `recording.${extensionFor(input.mimeType)}`,
    );
    form.append("model", this.config.openAI.sttModel);
    form.append("language", input.language);
    form.append("response_format", "json");

    const url = withAzureApiVersion(
      `${this.config.openAI.baseUrl}/audio/transcriptions`,
      this.config.openAI.baseUrl,
    );

    const response = await fetch(url, {
      method: "POST",
      headers: authHeaders(this.config.openAI.apiKey, this.config.openAI.baseUrl),
      body: form,
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });

    if (!response.ok) providerFailure(response, "Speech-to-text");

    let payload: { text?: unknown };
    try {
      payload = (await response.json()) as { text?: unknown };
    } catch {
      throw new VoiceProviderError("PROVIDER_ERROR", "Speech-to-text returned invalid JSON");
    }
    if (typeof payload.text !== "string") {
      throw new VoiceProviderError("PROVIDER_ERROR", "Speech-to-text returned no transcript");
    }

    return {
      transcript: payload.text,
      provider: this.label,
      confidence: undefined,
    };
  }
}

export class OpenAICompatibleTtsProvider implements TextToSpeechProvider {
  readonly id = "openai";
  readonly label = "OpenAI-compatible text-to-speech";

  constructor(private readonly config: VoiceConfig) {}

  async synthesize(input: TtsInput): Promise<TtsResult> {
    if (!this.config.openAI.apiKey) {
      throw new VoiceProviderError("PROVIDER_NOT_CONFIGURED", "Text-to-speech is not configured");
    }

    const url = withAzureApiVersion(
      `${this.config.openAI.baseUrl}/audio/speech`,
      this.config.openAI.baseUrl,
    );

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(this.config.openAI.apiKey, this.config.openAI.baseUrl),
      },
      body: JSON.stringify({
        model: this.config.openAI.ttsModel,
        input: input.text,
        voice: ttsVoiceForLanguage(this.config, input.language),
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });

    if (!response.ok) providerFailure(response, "Text-to-speech");

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.byteLength) {
      throw new VoiceProviderError("PROVIDER_ERROR", "Text-to-speech returned an empty file");
    }
    if (bytes.byteLength > 8 * 1024 * 1024) {
      throw new VoiceProviderError("PROVIDER_ERROR", "Text-to-speech response was too large");
    }

    const headerType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim();
    const mimeType = headerType?.startsWith("audio/") ? headerType : "audio/mpeg";

    return { audio: bytes, mimeType, provider: this.label };
  }
}

export function getSpeechToTextProvider(config: VoiceConfig): SpeechToTextProvider | null {
  if (config.sttProvider === "openai" && config.serverSttAvailable) {
    return new OpenAICompatibleSttProvider(config);
  }
  return null;
}

export function getTextToSpeechProvider(config: VoiceConfig): TextToSpeechProvider | null {
  if (config.ttsProvider === "openai" && config.serverTtsAvailable) {
    return new OpenAICompatibleTtsProvider(config);
  }
  return null;
}
