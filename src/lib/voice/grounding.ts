import type { AnswerConfidence, ChatSource, ChatSourceFact, Language } from "@/types/domain";
import type { AIContext } from "@/lib/ai/types";
import { createTranslator } from "@/lib/i18n";

/**
 * Grounding checks for assistant answers.
 *
 * Providers are allowed to phrase an answer, but they are not allowed to invent
 * a value or a source. This module:
 *   • rebuilds source cards from the server-side context (never from provider text),
 *   • drops record ids the profile does not own,
 *   • verifies every number-with-unit in a generated answer against the context,
 *   • records explicit limitations for missing, ambiguous or low-confidence data.
 */

export const LOW_OCR_CONFIDENCE = 0.8;

export type LimitationCode =
  | "NOT_IN_RECORDS"
  | "LOW_CONFIDENCE_EXTRACTION"
  | "AMBIGUOUS_SOURCE"
  | "NO_SOURCE_REFERENCE"
  | "PROVIDER_FALLBACK"
  | "UNVERIFIED_VALUES"
  | "UNGROUNDED_VALUES";

export type AnswerLimitation = {
  code: LimitationCode;
  message: string;
};

export type GroundedAnswer = {
  content: string;
  sources: ChatSource[];
  grounded: boolean;
  intent: string;
  fallbackReason?: string;
};

export function buildSourceFacts(contextRecord: AIContext["records"][number]): ChatSourceFact[] {
  return contextRecord.labValues.slice(0, 6).map((value) => ({
    testName: value.testName,
    value: value.value,
    unit: value.unit,
    referenceRange: value.referenceRange,
    status: value.status,
    isVerified: Boolean(value.isVerified),
  }));
}

/**
 * Rebuilds provider source references from the signed-in profile's context.
 * A provider can only ever surface records that were passed to it; any other id
 * is silently dropped.
 */
export function enrichSources(
  providerSources: readonly ChatSource[],
  context: AIContext,
): ChatSource[] {
  const byId = new Map(context.records.map((record) => [record.id, record]));
  const seen = new Set<string>();
  const enriched: ChatSource[] = [];

  for (const source of providerSources) {
    const record = byId.get(source.recordId);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    const confidence =
      typeof record.ocrConfidence === "number" ? record.ocrConfidence : source.ocrConfidence ?? null;
    enriched.push({
      recordId: record.id,
      // Titles, dates and types come from the database, not the model.
      title: record.title,
      date: record.date.toISOString(),
      type: record.type,
      facts: buildSourceFacts(record),
      ocrConfidence: confidence,
      needsReview:
        record.status === "NEEDS_REVIEW" ||
        (typeof confidence === "number" && confidence < LOW_OCR_CONFIDENCE),
    });
    if (enriched.length >= 4) break;
  }

  return enriched;
}

// ── Numeric verification ───────────────────────────────────────────────────

const UNIT_PATTERN =
  "(mg\\/dL|g\\/dL|%|mmHg|kg|cm|mmol\\/L|µmol\\/L|umol\\/L|IU\\/L|U\\/L|ng\\/mL|pg\\/mL|mIU\\/L|µIU\\/mL|10³\\/µL|10\\^3\\/µL|million\\/µL|cells\\/µL|bpm|°C|°F|fL|mL\\/min)";
const CLAIM_PATTERN = new RegExp(
  `(\\d+(?:\\.\\d+)?)(?:\\s*\\/\\s*(\\d+(?:\\.\\d+)?))?\\s*${UNIT_PATTERN}`,
  "gi",
);

function collectAllowedNumbers(context: AIContext): number[] {
  const values: number[] = [];
  const push = (value: number | null | undefined) => {
    if (typeof value === "number" && Number.isFinite(value)) values.push(value);
  };
  const pushNumbersIn = (text: string | null | undefined) => {
    if (!text) return;
    for (const match of text.matchAll(/-?\d+(?:\.\d+)?/g)) {
      push(Number(match[0]));
    }
  };

  for (const metric of context.metrics) push(metric.value);
  for (const record of context.records) {
    for (const lab of record.labValues) {
      push(lab.numericValue);
      pushNumbersIn(lab.value);
      pushNumbersIn(lab.referenceRange);
    }
    for (const medicine of record.medicines) pushNumbersIn(medicine.dosage);
  }
  for (const medicine of context.medications) pushNumbersIn(medicine.dosage);

  return values;
}

/**
 * Finds values in a generated answer that are not present anywhere in the
 * allowed context. Dates, phone numbers and counts without a clinical unit are
 * ignored on purpose.
 */
export function findUnsupportedNumericClaims(content: string, context: AIContext): string[] {
  const allowed = collectAllowedNumbers(context);
  const unsupported: string[] = [];

  for (const match of content.matchAll(CLAIM_PATTERN)) {
    const numbers = [match[1], match[2]].filter((value): value is string => Boolean(value));
    for (const raw of numbers) {
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      const supported = allowed.some((candidate) => Math.abs(candidate - value) <= 0.011);
      if (!supported) {
        unsupported.push(match[0].trim());
        break;
      }
    }
    if (unsupported.length >= 5) break;
  }

  return [...new Set(unsupported)];
}

// ── Ambiguity + limitations ─────────────────────────────────────────────────

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function isGenericReportQuestion(question: string, context: AIContext): boolean {
  const q = normalize(question);
  const generic = /\b(report|reports|result|results|record|records)\b|रिपोर्ट|रिकॉर्ड|परिणाम|जाँच/.test(q);
  if (!generic) return false;
  if (context.records.length < 2) return false;

  // A specific report title, test name or year makes the question unambiguous.
  const mentionsTitle = context.records.some((record) => {
    const title = normalize(record.title);
    return title.length >= 6 && q.includes(title);
  });
  if (mentionsTitle) return false;

  const mentionsTest = context.records.some((record) =>
    record.labValues.some((value) => {
      const name = normalize(value.testName);
      return name.length >= 4 && q.includes(name);
    }),
  );
  if (mentionsTest) return false;

  const mentionsYear = /\b(20\d{2})\b/.test(q);
  return !mentionsYear;
}

export type GroundingInput = {
  question: string;
  context: AIContext;
  response: GroundedAnswer;
  language: Language;
  numericClaims: string[];
};

export type GroundingAssessment = {
  limitations: AnswerLimitation[];
  confidence: AnswerConfidence;
  hasLowConfidenceSource: boolean;
  hasUnverifiedValues: boolean;
};

export function assessGrounding(input: GroundingInput): GroundingAssessment {
  const t = createTranslator(input.language);
  const { response, context, question } = input;
  const limitations: AnswerLimitation[] = [];
  const add = (code: LimitationCode, message: string) => {
    if (!limitations.some((item) => item.code === code)) limitations.push({ code, message });
  };

  if (!response.grounded) {
    add("NOT_IN_RECORDS", t("voice.limit.NOT_IN_RECORDS"));
  }

  const lowConfidenceSources = response.sources.filter(
    (source) =>
      source.needsReview === true ||
      (typeof source.ocrConfidence === "number" && source.ocrConfidence < LOW_OCR_CONFIDENCE),
  );
  if (lowConfidenceSources.length > 0) {
    add("LOW_CONFIDENCE_EXTRACTION", t("voice.limit.LOW_CONFIDENCE_EXTRACTION"));
  }

  if (response.grounded && isGenericReportQuestion(question, context)) {
    add("AMBIGUOUS_SOURCE", t("voice.limit.AMBIGUOUS_SOURCE"));
  }

  if (
    response.grounded &&
    response.sources.length === 0 &&
    response.intent !== "term_meaning"
  ) {
    add("NO_SOURCE_REFERENCE", t("voice.limit.NO_SOURCE_REFERENCE"));
  }

  if (response.fallbackReason) {
    add("PROVIDER_FALLBACK", t("voice.limit.PROVIDER_FALLBACK"));
  }

  const hasUnverifiedValues = response.sources.some((source) =>
    source.facts?.some((fact) => !fact.isVerified),
  );
  if (hasUnverifiedValues) {
    add("UNVERIFIED_VALUES", t("voice.limit.UNVERIFIED_VALUES"));
  }

  if (input.numericClaims.length > 0) {
    add("UNGROUNDED_VALUES", t("voice.limit.UNGROUNDED_VALUES"));
  }

  let confidence: AnswerConfidence;
  if (!response.grounded) confidence = "none";
  else if (input.numericClaims.length > 0) confidence = "low";
  else if (limitations.length > 0) confidence = "medium";
  else confidence = "high";

  return {
    limitations,
    confidence,
    hasLowConfidenceSource: lowConfidenceSources.length > 0,
    hasUnverifiedValues,
  };
}
