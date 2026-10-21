import type { TranslationKey } from "@/lib/i18n";
import type { ResultStatus } from "@/types/domain";

/**
 * Catalog of the health values the app understands.
 *
 * `key` is the stable identifier stored in HealthMetric.metricKey and is also
 * used by the OCR parser when it maps a lab test name to a metric. Reference
 * ranges are NEVER invented here — the app only compares against ranges that
 * were printed on the uploaded report (`referenceRange` on LabResult), so we can
 * honestly say "outside the reference range" instead of "dangerous".
 */

export type MetricKey =
  | "hemoglobin"
  | "glucose_fasting"
  | "glucose_random"
  | "hba1c"
  | "bp_systolic"
  | "bp_diastolic"
  | "heart_rate"
  | "weight"
  | "height"
  | "vitamin_d"
  | "cholesterol_total"
  | "cholesterol_ldl"
  | "cholesterol_hdl"
  | "triglycerides"
  | "creatinine"
  | "tsh"
  | "uric_acid"
  | "platelets"
  | "wbc"
  | "rbc";

export type MetricDefinition = {
  key: MetricKey;
  labelKey: TranslationKey;
  unit: string;
  /** Aliases used when parsing OCR text. */
  aliases: string[];
  /** Charts that pair two series (blood pressure) render them together. */
  pairedWith?: MetricKey;
  /** Shown by default in the trends picker. */
  featured?: boolean;
  /** Blood pressure is displayed as `120/80`, not as a single number. */
  composite?: boolean;
  decimals?: number;
};

export const METRICS: MetricDefinition[] = [
  {
    key: "hemoglobin",
    labelKey: "metric.hemoglobin",
    unit: "g/dL",
    aliases: ["hemoglobin", "haemoglobin", "hb", "hgb", "हीमोग्लोबिन", "हिमोग्लोबिन"],
    featured: true,
    decimals: 1,
  },
  {
    key: "glucose_fasting",
    labelKey: "metric.glucose_fasting",
    unit: "mg/dL",
    aliases: ["fasting blood sugar", "fasting glucose", "fbs", "glucose fasting", "glucose, fasting", "फास्टिंग शुगर", "खाली पेट शुगर"],
    featured: true,
  },
  {
    key: "glucose_random",
    labelKey: "metric.glucose_random",
    unit: "mg/dL",
    aliases: ["random blood sugar", "post prandial", "ppbs", "blood sugar", "glucose", "rbs", "ब्लड शुगर", "शुगर"],
    featured: true,
  },
  { key: "hba1c", labelKey: "metric.hba1c", unit: "%", aliases: ["hba1c", "glycated hemoglobin", "a1c", "एचबीए1सी"] },
  {
    key: "bp_systolic",
    labelKey: "metric.bp_systolic",
    unit: "mmHg",
    aliases: ["systolic", "blood pressure", "bp", "रक्तचाप", "ब्लड प्रेशर", "बीपी"],
    pairedWith: "bp_diastolic",
    featured: true,
    composite: true,
  },
  {
    key: "bp_diastolic",
    labelKey: "metric.bp_systolic",
    unit: "mmHg",
    aliases: ["diastolic", "डायस्टोलिक"],
    composite: true,
  },
  { key: "heart_rate", labelKey: "metric.heart_rate", unit: "bpm", aliases: ["heart rate", "pulse", "pulse rate", "हृदय गति", "धड़कन"], featured: true },
  { key: "weight", labelKey: "metric.weight", unit: "kg", aliases: ["weight", "body weight", "वजन"], featured: true, decimals: 1 },
  { key: "height", labelKey: "metric.height", unit: "cm", aliases: ["height", "ऊंचाई", "लंबाई"] },
  { key: "vitamin_d", labelKey: "metric.vitamin_d", unit: "ng/mL", aliases: ["vitamin d", "25-oh vitamin d", "vit d3", "विटामिन डी"], featured: true },
  {
    key: "cholesterol_total",
    labelKey: "metric.cholesterol_total",
    unit: "mg/dL",
    aliases: ["total cholesterol", "cholesterol total", "cholesterol", "कोलेस्ट्रॉल"],
    featured: true,
  },
  { key: "cholesterol_ldl", labelKey: "metric.cholesterol_ldl", unit: "mg/dL", aliases: ["ldl cholesterol", "ldl", "एलडीएल"] },
  { key: "cholesterol_hdl", labelKey: "metric.cholesterol_hdl", unit: "mg/dL", aliases: ["hdl cholesterol", "hdl", "एचडीएल"] },
  { key: "triglycerides", labelKey: "metric.triglycerides", unit: "mg/dL", aliases: ["triglycerides", "triglyceride", "tg", "ट्राइग्लिसराइड"] },
  { key: "creatinine", labelKey: "metric.creatinine", unit: "mg/dL", aliases: ["creatinine", "serum creatinine", "क्रिएटिनिन"] },
  { key: "tsh", labelKey: "metric.tsh", unit: "µIU/mL", aliases: ["tsh", "thyroid stimulating hormone", "टीएसएच", "थायरॉयड"] },
  { key: "uric_acid", labelKey: "metric.uric_acid", unit: "mg/dL", aliases: ["uric acid", "यूरिक एसिड"] },
  { key: "platelets", labelKey: "metric.platelets", unit: "10³/µL", aliases: ["platelet count", "platelets", "plt", "प्लेटलेट"] },
  { key: "wbc", labelKey: "metric.wbc", unit: "10³/µL", aliases: ["total leucocyte count", "wbc", "white blood cells", "tlc", "डब्ल्यूबीसी", "श्वेत रक्त कोशिका"] },
  { key: "rbc", labelKey: "metric.rbc", unit: "million/µL", aliases: ["rbc count", "red blood cells", "rbc", "आरबीसी", "लाल रक्त कोशिका"] },
];

const METRIC_BY_KEY = new Map(METRICS.map((m) => [m.key, m]));

export function getMetric(key: string): MetricDefinition | undefined {
  return METRIC_BY_KEY.get(key as MetricKey);
}

/** Maps a free-text lab test name to a metric key (falls back to a slug). */
export function metricKeyForTestName(testName: string): MetricKey | null {
  const needle = testName.toLowerCase().replace(/\s+/g, " ").trim();
  let best: { key: MetricKey; score: number } | null = null;
  for (const metric of METRICS) {
    for (const alias of metric.aliases) {
      if (needle === alias) return metric.key;
      if (needle.includes(alias) && alias.length >= 3) {
        const score = alias.length;
        if (!best || score > best.score) best = { key: metric.key, score };
      }
    }
  }
  return best?.key ?? null;
}

/**
 * Reference ranges.
 *
 * IMPORTANT: this map is intentionally empty of clinical constants. We only use
 * the range printed on the user's own report. Keeping the function (instead of
 * hardcoding numbers) documents that decision and gives one place to plug in a
 * licensed reference-range source later.
 */
export const CLASSIFICATION_RULE_VERSION = "report-range-v1";

export type ParsedReferenceRange = {
  low: number;
  high: number;
  unit?: string;
  lowInclusive: boolean;
  highInclusive: boolean;
};

const RANGE_UNIT = "([A-Za-zµμ%0-9/^³]+(?:\\s*[A-Za-zµμ%0-9/^³]+)?)?";

/** Parse numeric intervals and inequalities without inventing a range. */
export function parseReferenceRange(referenceRange: string | null | undefined): ParsedReferenceRange | null {
  if (!referenceRange) return null;
  const cleaned = referenceRange.trim().replace(/[–—]/g, "-").replace(/(\d),(\d)/g, "$1$2");
  const inequality = cleaned.match(/^(<=|>=|<|>|≤|≥)\s*(-?\d+(?:\.\d+)?)\s*([A-Za-zµμ%0-9/^³]+(?:\s*[A-Za-zµμ%0-9/^³]+)?)?$/);
  if (inequality) {
    const operator = inequality[1];
    const number = Number(inequality[2]);
    const unit = inequality[3]?.trim();
    if (!Number.isFinite(number)) return null;
    if (operator === "<" || operator === "<=" || operator === "≤") {
      return { low: Number.NEGATIVE_INFINITY, high: number, unit, lowInclusive: false, highInclusive: operator !== "<" };
    }
    return { low: number, high: Number.POSITIVE_INFINITY, unit, lowInclusive: operator !== ">", highInclusive: false };
  }
  const interval = cleaned.match(new RegExp(`^\\s*(-?\\d+(?:\\.\\d+)?)\\s*(?:-|to)\\s*(-?\\d+(?:\\.\\d+)?)\\s*${RANGE_UNIT}\\s*$`, "i"));
  if (!interval) return null;
  const low = Number(interval[1]);
  const high = Number(interval[2]);
  if (!Number.isFinite(low) || !Number.isFinite(high) || low > high) return null;
  return { low, high, unit: interval[3]?.trim() || undefined, lowInclusive: true, highInclusive: true };
}

const UNIT_ALIASES: Record<string, string> = {
  "gm/dl": "g/dl", "g/dl": "g/dl", "g/l": "g/l",
  "mg/dl": "mg/dl", "mg/l": "mg/l", "mmol/l": "mmol/l",
  "ng/ml": "ng/ml", "pg/ml": "pg/ml", "uiu/ml": "uiu/ml", "µiu/ml": "uiu/ml", "μiu/ml": "uiu/ml",
  "miu/l": "miu/l", "iu/l": "iu/l", "%": "%", "bpm": "bpm", "mmhg": "mmhg",
  "kg": "kg", "g": "g", "cm": "cm", "fl": "fl", "pg": "pg", "sec": "sec",
  "10^3/ul": "10^3/ul", "10³/µl": "10^3/ul", "10^3/µl": "10^3/ul",
  "cells/ul": "cells/ul", "cells/µl": "cells/ul", "million/ul": "million/ul", "million/µl": "million/ul",
};

export function normalizeClinicalUnit(unit: string | null | undefined): string | null {
  if (!unit?.trim()) return null;
  const cleaned = unit.toLowerCase().replace(/μ/g, "µ").replace(/\s+/g, "");
  return UNIT_ALIASES[cleaned] ?? cleaned;
}

export function unitsCompatible(resultUnit: string | null | undefined, rangeUnit: string | null | undefined): boolean {
  if (!rangeUnit) return true;
  if (!resultUnit) return false;
  return normalizeClinicalUnit(resultUnit) === normalizeClinicalUnit(rangeUnit);
}

/** Compare only against a range supplied by the same report; no generic thresholds. */
export function evaluateAgainstRange(
  value: number | null | undefined,
  referenceRange: string | null | undefined,
  valueUnit?: string | null,
): ResultStatus {
  if (value === null || value === undefined || !Number.isFinite(value)) return "UNKNOWN";
  const range = parseReferenceRange(referenceRange);
  if (!range || !unitsCompatible(valueUnit, range.unit)) return "UNKNOWN";
  if (value < range.low || (value === range.low && !range.lowInclusive)) return "BELOW_RANGE";
  if (value > range.high || (value === range.high && !range.highInclusive)) return "ABOVE_RANGE";
  return "WITHIN_RANGE";
}

export type LabClassification = {
  status: ResultStatus;
  reason: string;
  criticalFlag: boolean;
};

/**
 * Deterministic report rule. Red is reserved for a high-confidence critical/panic
 * mark explicitly printed by the source laboratory. Generic out-of-range values
 * are orange, and no clinical thresholds are invented here.
 */
export function classifyLabResult(input: {
  value: number | null | undefined;
  unit?: string | null;
  referenceRange?: string | null;
  sourceFlag?: string | null;
  confidence?: number;
}): LabClassification {
  const flag = input.sourceFlag?.trim().toUpperCase() ?? "";
  const criticalFlag = /^(?:HH|LL|CRIT(?:ICAL)?|PANIC|CRITICAL\s+(?:HIGH|LOW))$/.test(flag);
  const confidence = input.confidence ?? 1;
  if (criticalFlag && confidence >= 0.65) {
    return { status: "CRITICAL", reason: "The source report explicitly flags this result as critical.", criticalFlag: true };
  }
  if (input.value === null || input.value === undefined || !Number.isFinite(input.value)) {
    return { status: "UNKNOWN", reason: "The result is not a reliably parsed numeric value.", criticalFlag };
  }
  if (confidence < 0.65) {
    return { status: "UNKNOWN", reason: "Low extraction confidence; review the source before interpreting this result.", criticalFlag };
  }

  const parsedRange = parseReferenceRange(input.referenceRange);
  if (parsedRange?.unit && !unitsCompatible(input.unit, parsedRange.unit)) {
    return { status: "UNKNOWN", reason: "The result unit and reference-range unit are missing or incompatible.", criticalFlag: false };
  }
  const status = evaluateAgainstRange(input.value, input.referenceRange, input.unit);
  if (status === "WITHIN_RANGE") {
    return { status, reason: "The result is within the reference range printed on this report.", criticalFlag: false };
  }
  if (status === "BELOW_RANGE" || status === "ABOVE_RANGE") {
    return { status, reason: `The result is ${status === "BELOW_RANGE" ? "below" : "above"} the reference range printed on this report.`, criticalFlag: false };
  }

  if (/^(?:H|HIGH|↑)$/.test(flag)) {
    return { status: "ABOVE_RANGE", reason: "The source report flags this result high; no parseable reference range was available.", criticalFlag: false };
  }
  if (/^(?:L|LOW|↓)$/.test(flag)) {
    return { status: "BELOW_RANGE", reason: "The source report flags this result low; no parseable reference range was available.", criticalFlag: false };
  }
  return { status: "UNKNOWN", reason: "No compatible reference range or explicit interpretation was available.", criticalFlag: false };
}

export type TrendPoint = { date: Date; value: number; unit: string; recordId?: string | null };

export type TrendSummary = {
  points: TrendPoint[];
  latest?: TrendPoint;
  previous?: TrendPoint;
  change?: number;
  direction: "up" | "down" | "flat" | "unknown";
  referenceRange?: string | null;
  status: ResultStatus;
};

/** Builds a chart-ready series plus a "compared with your previous report" delta. */
export function buildTrend(
  points: TrendPoint[],
  referenceRange?: string | null,
): TrendSummary {
  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());
  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const change = latest && previous ? latest.value - previous.value : undefined;
  const direction: TrendSummary["direction"] =
    change === undefined ? "unknown" : Math.abs(change) < 0.05 ? "flat" : change > 0 ? "up" : "down";

  return {
    points: sorted,
    latest,
    previous,
    change,
    direction,
    referenceRange: referenceRange ?? null,
    status: evaluateAgainstRange(latest?.value, referenceRange, latest?.unit),
  };
}

export function formatMetricValue(
  value: number,
  metric?: MetricDefinition | null,
  lang: "en" | "hi" = "en",
): string {
  const decimals = metric?.decimals ?? (Number.isInteger(value) ? 0 : 1);
  return new Intl.NumberFormat(lang === "hi" ? "hi-IN" : "en-IN", {
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Blood pressure is charted as two series; this pairs systolic/diastolic rows. */
export function pairBloodPressure<T extends { metricKey: string; recordedAt: Date; value: number }>(
  rows: T[],
): { date: Date; systolic?: number; diastolic?: number }[] {
  const byDay = new Map<string, { date: Date; systolic?: number; diastolic?: number }>();
  for (const row of rows) {
    if (row.metricKey !== "bp_systolic" && row.metricKey !== "bp_diastolic") continue;
    const key = row.recordedAt.toISOString().slice(0, 10);
    const entry = byDay.get(key) ?? { date: row.recordedAt };
    if (row.metricKey === "bp_systolic") entry.systolic = row.value;
    else entry.diastolic = row.value;
    byDay.set(key, entry);
  }
  return [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}
