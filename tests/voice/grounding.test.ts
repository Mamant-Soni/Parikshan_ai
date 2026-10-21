import test from "node:test";
import assert from "node:assert/strict";
import { MockHealthAIProvider } from "@/lib/ai/mock-provider";
import { runAssistantTurn } from "@/lib/voice/assistant";
import { enrichSources, findUnsupportedNumericClaims } from "@/lib/voice/grounding";
import type { ConversationTurn } from "@/lib/ai/types";
import { fakeProvider, makeContext, source } from "./fixtures";

const provider = new MockHealthAIProvider();

async function ask(
  question: string,
  overrides: Parameters<typeof makeContext>[0] = {},
  history: ConversationTurn[] = [],
) {
  const outcome = await runAssistantTurn({
    question,
    inputMode: "text",
    language: "en",
    context: makeContext(overrides),
    history,
    provider,
  });
  assert.equal(outcome.kind, "turn");
  if (outcome.kind !== "turn") throw new Error("expected a turn");
  return outcome.turn;
}

test("a grounded answer matches the source value, unit and date", async () => {
  const turn = await ask("What was my hemoglobin last time?");
  assert.equal(turn.grounded, true);
  assert.match(turn.content, /\b11\.0 g\/dL\b/);
  assert.match(turn.content, /12 Sept? 2026/);
  assert.equal(turn.sources[0]?.recordId, "rec-latest");
  assert.equal(turn.sources[0]?.facts?.[0]?.testName, "Hemoglobin");
  assert.equal(turn.sources[0]?.facts?.[0]?.value, "11.0");
  assert.equal(turn.sources[0]?.facts?.[0]?.unit, "g/dL");
  assert.equal(turn.sources[0]?.facts?.[0]?.referenceRange, "13.0 - 17.0");
  assert.equal(turn.confidence, "high");
  assert.equal(turn.numericClaims.length, 0);
});

test("missing data returns an explicit limitation, never an invented value", async () => {
  const turn = await ask("What was my ferritin last time?");
  assert.equal(turn.grounded, false);
  assert.match(turn.content, /couldn't find that information/i);
  assert.equal(turn.sources.length, 0);
  assert.equal(turn.confidence, "none");
  assert.ok(turn.limitations.some((item) => item.code === "NOT_IN_RECORDS"));
  assert.doesNotMatch(turn.content, /\d+(\.\d+)?\s*(mg|g|ng|pg|%|dl)/i);
});

test("source facts come from the context, not from the provider", async () => {
  const ctx = makeContext();
  const enriched = enrichSources([source("rec-latest", { title: "Fake title" })], ctx);
  assert.equal(enriched.length, 1);
  assert.equal(enriched[0]?.title, "Blood Test — Latest Report");
  assert.equal(enriched[0]?.facts?.length, 2);
});

test("a provider cannot surface another record by inventing an id", async () => {
  const turn = await runAssistantTurn({
    question: "What was my hemoglobin last time?",
    inputMode: "voice",
    language: "en",
    context: makeContext(),
    history: [],
    provider: fakeProvider({
      content: "Your hemoglobin is 11.0 g/dL.",
      sources: [source("someone-elses-record")],
    }),
  });
  assert.equal(turn.kind, "turn");
  if (turn.kind !== "turn") return;
  assert.equal(turn.turn.sources.length, 0);
  assert.ok(turn.turn.limitations.some((item) => item.code === "NO_SOURCE_REFERENCE"));
});

test("a fabricated numeric value is rejected and not displayed", async () => {
  const turn = await runAssistantTurn({
    question: "What was my hemoglobin last time?",
    inputMode: "voice",
    language: "en",
    context: makeContext(),
    history: [],
    provider: fakeProvider({
      content: "Your hemoglobin is 14.9 g/dL.",
      sources: [source("rec-latest")],
      intent: "lab_lookup",
    }),
  });
  assert.equal(turn.kind, "turn");
  if (turn.kind !== "turn") return;
  assert.equal(turn.turn.grounded, false);
  assert.equal(turn.turn.confidence, "low");
  assert.doesNotMatch(turn.turn.content, /14\.9/);
  assert.ok(turn.turn.numericClaims.some((claim) => claim.includes("14.9")));
  assert.ok(turn.turn.limitations.some((item) => item.code === "UNGROUNDED_VALUES"));
});

test("numbers already present in the records pass verification", () => {
  const ctx = makeContext();
  assert.deepEqual(findUnsupportedNumericClaims("Hemoglobin is 11.0 g/dL.", ctx), []);
  assert.deepEqual(findUnsupportedNumericClaims("Glucose is 108 mg/dL.", ctx), []);
  assert.deepEqual(findUnsupportedNumericClaims("Metformin 500 mg.", ctx), []);
});

test("low-confidence OCR is surfaced as a limitation", async () => {
  const ctx = makeContext();
  ctx.records = ctx.records.map((record) => ({
    ...record,
    id: record.id === "rec-latest" ? "rec-latest" : record.id,
    ocrConfidence: record.id === "rec-latest" ? 0.42 : record.ocrConfidence,
    status: record.id === "rec-latest" ? "NEEDS_REVIEW" : record.status,
  }));
  const outcome = await runAssistantTurn({
    question: "What was my hemoglobin last time?",
    inputMode: "text",
    language: "en",
    context: ctx,
    history: [],
    provider,
  });
  assert.equal(outcome.kind, "turn");
  if (outcome.kind !== "turn") return;
  const limitation = outcome.turn.limitations.find(
    (item) => item.code === "LOW_CONFIDENCE_EXTRACTION",
  );
  assert.ok(limitation);
  assert.ok(outcome.turn.confidence === "medium" || outcome.turn.confidence === "low");
  assert.ok(outcome.turn.spokenText.length > 0);
  // The spoken answer must carry the same caveat shown on screen, because the
  // server TTS route reads the persisted spokenText rather than the markup.
  assert.ok(limitation && outcome.turn.spokenText.includes(limitation.message.trim()));
});

test("a generic report question with several reports is marked ambiguous", async () => {
  const turn = await ask("Explain my report in simple language.");
  assert.equal(turn.grounded, true);
  assert.ok(turn.limitations.some((item) => item.code === "AMBIGUOUS_SOURCE"));
});

test("follow-up questions reuse the previous metric without widening access", async () => {
  const turn = await ask("And before that?", {}, [
    { role: "user", content: "What was my hemoglobin last time?" },
    { role: "assistant", content: "Your most recent Hemoglobin was 11.0 g/dL." },
  ]);
  assert.equal(turn.grounded, true);
  assert.match(turn.content, /Hemoglobin/i);
  assert.ok(turn.sources.every((item) => item.recordId.startsWith("rec-")));
});

test("a provider fallback is disclosed instead of hidden", async () => {
  const turn = await runAssistantTurn({
    question: "What was my hemoglobin last time?",
    inputMode: "text",
    language: "en",
    context: makeContext(),
    history: [],
    provider: fakeProvider({
      content: "Hemoglobin is 11.0 g/dL.",
      sources: [source("rec-latest")],
      fallbackReason: "provider-unavailable",
    }),
  });
  assert.equal(turn.kind, "turn");
  if (turn.kind !== "turn") return;
  assert.ok(turn.turn.limitations.some((item) => item.code === "PROVIDER_FALLBACK"));
});

test("Hindi answers keep the report value and unit", async () => {
  const outcome = await runAssistantTurn({
    question: "पिछली बार मेरा हीमोग्लोबिन कितना था?",
    inputMode: "voice",
    language: "hi",
    context: makeContext(),
    history: [],
    provider,
  });
  assert.equal(outcome.kind, "turn");
  if (outcome.kind !== "turn") return;
  assert.equal(outcome.turn.grounded, true);
  assert.match(outcome.turn.content, /\b11\.0 g\/dL\b/);
});
