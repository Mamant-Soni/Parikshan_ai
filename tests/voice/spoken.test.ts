import test from "node:test";
import assert from "node:assert/strict";
import {
  browserCanSpeakLanguage,
  browserLanguageTag,
  buildSpokenText,
  pickBrowserVoice,
} from "@/lib/voice/spoken";

test("spoken text removes markdown and bullets but keeps values and units", () => {
  const spoken = buildSpokenText(
    "**Hemoglobin**: 11.0 g/dL\n\n• Higher than 10.1 g/dL\n• Discuss with your doctor.",
  );
  assert.doesNotMatch(spoken, /\*\*|•/);
  assert.match(spoken, /11\.0 g\/dL/);
  assert.match(spoken, /10\.1 g\/dL/);
});

test("spoken text truncates at a sentence boundary", () => {
  const text = "First sentence. Second sentence that is quite long. Third sentence.";
  const spoken = buildSpokenText(text, 40);
  assert.ok(spoken.length <= 41);
  assert.ok(spoken.endsWith("…"));
  assert.ok(spoken.startsWith("First sentence."));
});

test("Hindi danda is preserved as punctuation", () => {
  const spoken = buildSpokenText("आपका हीमोग्लोबिन 11.0 g/dL है। कृपया डॉक्टर से बात करें।");
  assert.match(spoken, /11\.0 g\/dL/);
  assert.match(spoken, /।/);
});

test("browser voice selection prefers Indian voices and the right language", () => {
  const voices = [
    { lang: "en-US", name: "Generic English" },
    { lang: "en-IN", name: "English India", localService: true },
    { lang: "hi-IN", name: "Lekha", localService: false },
  ];
  assert.equal(pickBrowserVoice(voices, "en")?.name, "English India");
  assert.equal(pickBrowserVoice(voices, "hi")?.name, "Lekha");
});

test("no matching voice returns null so the UI can explain the limitation", () => {
  const voices = [{ lang: "en-US", name: "English" }];
  assert.equal(pickBrowserVoice(voices, "hi"), null);
  assert.equal(browserCanSpeakLanguage(voices, "hi"), false);
  assert.equal(browserCanSpeakLanguage([], "hi"), true);
});

test("language tags are Indian English and Hindi", () => {
  assert.equal(browserLanguageTag("en"), "en-IN");
  assert.equal(browserLanguageTag("hi"), "hi-IN");
});
