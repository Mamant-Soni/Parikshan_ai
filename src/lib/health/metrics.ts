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
export function parseReferenceRange(
  referenceRange: string | null | undefined,
): { low: number; high: number } | null {
  if (!referenceRange) return null;
  const cleaned = referenceRange.replace(/[–—]/g, "-").replace(/(\d),(\d)/g, "$1$2");
  const match = cleaned.match(/(-?\d+(?:\.\d+)?)\s*(?:-|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (match) {
    const low = Number(match[1]);
    const high = Number(match[2]);
    if (Number.isFinite(low) && Number.isFinite(high)) return { low, high };
  }
  const lessThan = cleaned.match(/<\s*(-?\d+(?:\.\d+)?)/);
  if (lessThan) return { low: Number.NEGATIVE_INFINITY, high: Number(lessThan[1]) };
  const greaterThan = cleaned.match(/>\s*(-?\d+(?:\.\d+)?)/);
  if (greaterThan) return { low: Number(greaterThan[1]), high: Number.POSITIVE_INFINITY };
  return null;
}

/** Classifies a value against the range printed on the report. */
export function evaluateAgainstRange(
  value: number | null | undefined,
  referenceRange: string | null | undefined,
): ResultStatus {
  if (value === null || value === undefined || !Number.isFinite(value)) return "UNKNOWN";
  const range = parseReferenceRange(referenceRange);
  if (!range) return "UNKNOWN";
  if (value < range.low) return "BELOW_RANGE";
  if (value > range.high) return "ABOVE_RANGE";
  return "WITHIN_RANGE";
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
    status: evaluateAgainstRange(latest?.value, referenceRange),
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
