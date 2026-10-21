import test from "node:test";
import assert from "node:assert/strict";
import {
  classifySpeechError,
  httpStatusForVoiceError,
  isVoiceErrorCode,
  voiceErrorTranslationKey,
} from "@/lib/voice/errors";
import { isSameOriginRequest } from "@/lib/voice/http";

function namedError(name: string) {
  const error = new Error(name);
  error.name = name;
  return error;
}

test("browser permission and device errors are classified precisely", () => {
  assert.equal(classifySpeechError(namedError("NotAllowedError")), "PERMISSION_DENIED");
  assert.equal(classifySpeechError(namedError("SecurityError")), "PERMISSION_DENIED");
  assert.equal(classifySpeechError(namedError("NotFoundError")), "NO_MICROPHONE");
  assert.equal(classifySpeechError(namedError("NotReadableError")), "MICROPHONE_BUSY");
  assert.equal(classifySpeechError(namedError("NetworkError")), "NETWORK_ERROR");
  assert.equal(classifySpeechError(namedError("AbortError")), "CANCELLED");
  assert.equal(classifySpeechError("not-allowed"), "PERMISSION_DENIED");
  assert.equal(classifySpeechError("no-speech"), "NO_SPEECH");
  assert.equal(classifySpeechError("language-not-supported"), "LANGUAGE_UNSUPPORTED");
  assert.equal(classifySpeechError(undefined), "GENERIC");
});

test("error codes map to honest HTTP statuses", () => {
  assert.equal(httpStatusForVoiceError("UNAUTHENTICATED"), 401);
  assert.equal(httpStatusForVoiceError("FORBIDDEN"), 403);
  assert.equal(httpStatusForVoiceError("RATE_LIMITED"), 429);
  assert.equal(httpStatusForVoiceError("AUDIO_TOO_LARGE"), 413);
  assert.equal(httpStatusForVoiceError("UNSUPPORTED_AUDIO"), 415);
  assert.equal(httpStatusForVoiceError("PROVIDER_NOT_CONFIGURED"), 503);
  assert.equal(httpStatusForVoiceError("PROVIDER_ERROR"), 502);
  assert.equal(httpStatusForVoiceError("TIMEOUT"), 504);
});

test("every error has a localised user-facing message key", () => {
  const key = voiceErrorTranslationKey("PERMISSION_DENIED");
  assert.equal(key, "voice.permissionDeniedTitle");
  assert.equal(isVoiceErrorCode("NO_SPEECH"), true);
  assert.equal(isVoiceErrorCode("definitely-not-a-code"), false);
});

test("same-origin checks accept same-host and non-browser requests", () => {
  assert.equal(isSameOriginRequest(new Headers({ origin: "https://app.example", host: "app.example" })), true);
  assert.equal(isSameOriginRequest(new Headers({ origin: "https://evil.example", host: "app.example" })), false);
  assert.equal(isSameOriginRequest(new Headers({ host: "app.example" })), true);
  assert.equal(isSameOriginRequest(new Headers({ origin: "not a url", host: "app.example" })), false);
});
