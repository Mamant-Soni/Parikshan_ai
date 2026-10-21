import test from "node:test";
import assert from "node:assert/strict";
import {
  getSpeechToTextProvider,
  getTextToSpeechProvider,
} from "@/lib/voice/providers";
import {
  getVoiceConfig,
  getVoicePublicConfig,
  isSupportedAudioType,
  ttsVoiceForLanguage,
} from "@/lib/voice/config";

test("browser speech is the default and requires no credentials", () => {
  const config = getVoiceConfig({});
  assert.equal(config.sttProvider, "browser");
  assert.equal(config.ttsProvider, "browser");
  assert.equal(config.serverSttAvailable, false);
  assert.equal(config.serverTtsAvailable, false);
  assert.equal(getSpeechToTextProvider(config), null);
  assert.equal(getTextToSpeechProvider(config), null);
});

test("a server provider without a key falls back to the browser and reports why", () => {
  const config = getVoiceConfig({
    VOICE_STT_PROVIDER: "openai",
    VOICE_TTS_PROVIDER: "openai",
    OPENAI_API_KEY: "",
  });
  assert.equal(config.sttProvider, "browser");
  assert.equal(config.ttsProvider, "browser");
  assert.equal(config.requestedSttProvider, "openai");
  assert.ok(config.notes.includes("STT_CREDENTIALS_MISSING"));
  assert.ok(config.notes.includes("TTS_CREDENTIALS_MISSING"));
});

test("a server provider with a key is selected", () => {
  const config = getVoiceConfig({
    VOICE_STT_PROVIDER: "openai",
    VOICE_TTS_PROVIDER: "openai",
    VOICE_OPENAI_API_KEY: "sk-test-not-real",
    VOICE_STT_MODEL: "whisper-1",
  });
  assert.equal(config.sttProvider, "openai");
  assert.equal(config.serverSttAvailable, true);
  assert.ok(getSpeechToTextProvider(config));
  assert.ok(getTextToSpeechProvider(config));
});

test("public configuration never contains provider secrets", () => {
  const publicConfig = getVoicePublicConfig({
    VOICE_STT_PROVIDER: "openai",
    VOICE_TTS_PROVIDER: "openai",
    VOICE_OPENAI_API_KEY: "sk-super-secret-key",
    OPENAI_API_KEY: "sk-other-secret",
    VOICE_OPENAI_BASE_URL: "https://example.invalid/v1",
  });
  const serialized = JSON.stringify(publicConfig);
  assert.doesNotMatch(serialized, /sk-super-secret|sk-other-secret|apiKey|baseUrl/i);
  assert.equal(publicConfig.audioRetention, "none");
  assert.equal(publicConfig.transcriptRetention, "chat-history");
  assert.deepEqual(publicConfig.languages, ["en", "hi"]);
  assert.ok(publicConfig.serverSttAvailable);
});

test("unknown provider values degrade to the browser with a note", () => {
  const config = getVoiceConfig({ VOICE_STT_PROVIDER: "some-vendor" });
  assert.equal(config.sttProvider, "browser");
  assert.ok(config.notes.includes("STT_PROVIDER_UNKNOWN"));
});

test("limits are clamped to safe values", () => {
  const config = getVoiceConfig({
    VOICE_MAX_RECORDING_SECONDS: "9999",
    VOICE_MAX_AUDIO_MB: "0",
    VOICE_MAX_SPEAK_CHARS: "-5",
    VOICE_MAX_QUESTION_CHARS: "10000",
  });
  assert.equal(config.maxRecordingSeconds, 120);
  assert.equal(config.maxAudioMb, 1);
  assert.equal(config.maxSpeakChars, 200);
  assert.equal(config.maxQuestionChars, 400);
});

test("audio type validation rejects non-audio uploads", () => {
  assert.equal(isSupportedAudioType("audio/webm;codecs=opus"), true);
  assert.equal(isSupportedAudioType("audio/mp4"), true);
  assert.equal(isSupportedAudioType("text/plain"), false);
  assert.equal(isSupportedAudioType("application/octet-stream"), false);
});

test("default voices differ by language when only the shared setting is empty", () => {
  const config = getVoiceConfig({});
  assert.equal(ttsVoiceForLanguage(config, "en"), "alloy");
  assert.equal(ttsVoiceForLanguage(config, "hi"), "shimmer");
  assert.notEqual(ttsVoiceForLanguage(config, "en"), ttsVoiceForLanguage(config, "hi"));
});

test("TTS voice selection is language-specific and configurable", () => {
  const config = getVoiceConfig({
    VOICE_TTS_VOICE_EN: "voice-en",
    VOICE_TTS_VOICE_HI: "voice-hi",
  });
  assert.equal(ttsVoiceForLanguage(config, "en"), "voice-en");
  assert.equal(ttsVoiceForLanguage(config, "hi"), "voice-hi");
});
