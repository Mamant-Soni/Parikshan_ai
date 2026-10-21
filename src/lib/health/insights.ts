import type { TranslationKey } from "@/lib/i18n";
import { evaluateAgainstRange, getMetric } from "./metrics";
import type { ResultStatus } from "@/types/domain";

/**
 * Insight generation for the dashboard ("3 things changed since your previous
 * report").
 *
 * The rules are deliberately conservative: we only compare a value with the
 * same value in the previous record and describe the arithmetic change. We do
 * not label anything as dangerous — a value is only described as outside the
 * reference range, and only when the user's own report printed a range.
 */

export type MetricLike = {
  metricKey: string;
  label: string;
  value: number;
  unit: string;
  recordedAt: Date;
  referenceRange?: string | null;
  sourceRecordId?: string | null;
  sourceRecordTitle?: string | null;
};

export type Insight = {
  id: string;
  metricKey: string;
  label: string;
  labelKey: TranslationKey | null;
  unit: string;
  from: number;
  to: number;
  delta: number;
  direction: "up" | "down" | "flat";
  status: ResultStatus;
  referenceRange: string | null;
  recordId: string | null;
  recordTitle: string | null;
  date: Date;
};

export function buildInsights(metrics: MetricLike[], max = 3): Insight[] {
  const byKey = new Map<string, MetricLike[]>();
  for (const metric of metrics) {
    if (metric.metricKey === "bp_diastolic") continue; // Reported together with systolic.
    const list = byKey.get(metric.metricKey) ?? [];
    list.push(metric);
    byKey.set(metric.metricKey, list);
  }

  const insights: Insight[] = [];
  for (const [metricKey, list] of byKey) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
    const previous = sorted[sorted.length - 2];
    const latest = sorted[sorted.length - 1];
    const delta = latest.value - previous.value;
    const direction = Math.abs(delta) < 0.05 ? "flat" : delta > 0 ? "up" : "down";
    if (direction === "flat" && metricKey !== "bp_systolic") continue;

    insights.push({
      id: `${metricKey}-${latest.sourceRecordId ?? latest.recordedAt.toISOString()}`,
      metricKey,
      label: latest.label,
      labelKey: getMetric(metricKey)?.labelKey ?? null,
      unit: latest.unit,
      from: previous.value,
      to: latest.value,
      delta,
      direction,
      status: evaluateAgainstRange(latest.value, latest.referenceRange ?? null),
      referenceRange: latest.referenceRange ?? null,
      recordId: latest.sourceRecordId ?? null,
      recordTitle: latest.sourceRecordTitle ?? null,
      date: latest.recordedAt,
    });
  }

  // Biggest absolute change first — that is what a person notices.
  insights.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return insights.slice(0, max);
}
