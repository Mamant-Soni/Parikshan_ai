/**
 * Domain vocabulary shared by the UI, the API layer and Prisma.
 *
 * SQLite has no native enum support, so Prisma stores these as strings and the
 * Zod schemas in `src/lib/validation.ts` enforce the allowed values at every
 * write boundary. Keeping the unions here means the compiler catches typos.
 */

// ── Records ────────────────────────────────────────────────────────────────
export const RECORD_TYPES = [
  "PRESCRIPTION",
  "LAB_REPORT",
  "DOCTOR_VISIT",
  "DISCHARGE_SUMMARY",
  "VACCINATION",
  "IMAGING",
  "OTHER",
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const RECORD_STATUSES = ["PROCESSING", "READY", "NEEDS_REVIEW", "FAILED"] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

// ── Lab values ─────────────────────────────────────────────────────────────
export const RESULT_STATUSES = ["WITHIN_RANGE", "BELOW_RANGE", "ABOVE_RANGE", "UNKNOWN"] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

// ── Medications ────────────────────────────────────────────────────────────
export const MEDICATION_STATUSES = ["ACTIVE", "COMPLETED", "UPCOMING"] as const;
export type MedicationStatus = (typeof MEDICATION_STATUSES)[number];

export const DOSE_SLOTS = ["MORNING", "AFTERNOON", "EVENING", "NIGHT"] as const;
export type DoseSlot = (typeof DOSE_SLOTS)[number];

export const DOSE_STATUSES = ["PENDING", "TAKEN", "SKIPPED"] as const;
export type DoseStatus = (typeof DOSE_STATUSES)[number];

/** Default reminder clock-time per slot (local demo reminders). */
export const SLOT_DEFAULT_TIME: Record<DoseSlot, string> = {
  MORNING: "08:00",
  AFTERNOON: "14:00",
  EVENING: "18:00",
  NIGHT: "20:00",
};

// ── Profiles ───────────────────────────────────────────────────────────────
export const RELATIONSHIPS = [
  "SELF",
  "CHILD",
  "PARENT",
  "SPOUSE",
  "SIBLING",
  "CAREGIVEE",
  "OTHER",
] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const PROFILE_KINDS = ["ADULT", "CHILD", "ELDER"] as const;
export type ProfileKind = (typeof PROFILE_KINDS)[number];

// ── Interaction severity ───────────────────────────────────────────────────
export const INTERACTION_SEVERITIES = ["MINOR", "MODERATE", "MAJOR", "UNKNOWN"] as const;
export type InteractionSeverity = (typeof INTERACTION_SEVERITIES)[number];

// ── AI / OCR ───────────────────────────────────────────────────────────────
export type Language = "en" | "hi";

export type HealthSummarySections = {
  /** "What this record says" */
  whatItSays: string;
  /** "What looks normal" — bullet list */
  looksNormal: string[];
  /** "What may need attention" — bullet list, hedged wording only */
  needsAttention: string[];
  /** "What the medical terms mean" */
  termExplanations: { term: string; explanation: string }[];
  /** "What to discuss with your doctor" */
  discussWithDoctor: string[];
  /** Record-level plain-language line for the timeline / dashboard. */
  plainSummary: string;
};

/**
 * A specific value quoted from the source record, shown beneath the source
 * link. The assistant may only attach facts that exist in the signed-in
 * profile's stored record — never values returned by a language model.
 */
export type ChatSourceFact = {
  testName: string;
  value: string;
  unit: string | null;
  referenceRange: string | null;
  status: ResultStatus;
  isVerified: boolean;
};

export type ChatSource = {
  recordId: string;
  title: string;
  date: string;
  type: RecordType | string;
  /** Values that support the answer (test name, value, unit, report range). */
  facts?: ChatSourceFact[];
  /** OCR confidence stored on the record (0..1) when known. */
  ocrConfidence?: number | null;
  /** True when the record was flagged for human review. */
  needsReview?: boolean;
};

/** How well an answer is supported by stored records. */
export type AnswerConfidence = "high" | "medium" | "low" | "none";

export type ChatAnswer = {
  content: string;
  sources: ChatSource[];
  grounded: boolean;
  intent: string;
  confidence?: AnswerConfidence;
  limitations?: string[];
};

export type InteractionFinding = {
  medicineA: string;
  medicineB: string;
  severity: InteractionSeverity;
  description: string;
  action: string;
  source: string;
};

export type OcrQuality = {
  provider: string;
  confidence: number; // 0..1
  /** Fields the parser was unsure about — surfaced in the UI for correction. */
  lowConfidenceFields: string[];
};
