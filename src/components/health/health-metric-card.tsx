"use client";

import Link from "next/link";
import { Activity, Droplet, HeartPulse, LineChart, Scale, Sun } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/components/providers/i18n-provider";
import { ResultStatusPill, TrendArrow } from "./status-pill";
import { ReadAloudButton } from "@/components/layout/read-aloud-button";
import { formatDate } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";

/**
 * Dashboard metric card ("🩸 Hemoglobin 14.5 g/dL, previous 13.9 ↑ 0.6").
 * Large numbers, plain labels, one clear action — optimised for readability.
 */

const METRIC_ICONS: Record<string, React.ReactNode> = {
  hemoglobin: <Droplet className="size-6" aria-hidden="true" />,
  glucose_fasting: <Activity className="size-6" aria-hidden="true" />,
  glucose_random: <Activity className="size-6" aria-hidden="true" />,
  hba1c: <Activity className="size-6" aria-hidden="true" />,
  bp_systolic: <HeartPulse className="size-6" aria-hidden="true" />,
  bp_diastolic: <HeartPulse className="size-6" aria-hidden="true" />,
  heart_rate: <HeartPulse className="size-6" aria-hidden="true" />,
  weight: <Scale className="size-6" aria-hidden="true" />,
  vitamin_d: <Sun className="size-6" aria-hidden="true" />,
  cholesterol_total: <LineChart className="size-6" aria-hidden="true" />,
};

const METRIC_EMOJI: Record<string, string> = {
  hemoglobin: "🩸",
  glucose_fasting: "🍬",
  glucose_random: "🍬",
  hba1c: "🍬",
  bp_systolic: "💓",
  heart_rate: "💓",
  weight: "⚖️",
  vitamin_d: "☀️",
  cholesterol_total: "🫀",
};

export type HealthMetricCardData = {
  metricKey: string;
  labelKey: TranslationKey | null;
  label: string;
  value: number;
  unit: string;
  previousValue?: number;
  previousDate?: Date | string;
  delta?: number;
  direction: "up" | "down" | "flat" | "unknown";
  status?: string;
  decimals?: number;
  pairedValue?: number;
};

export function HealthMetricCard({ metric, href }: { metric: HealthMetricCardData; href?: string }) {
  const { t, lang, easyRead } = useI18n();
  const label = metric.labelKey ? t(metric.labelKey) : metric.label;
  const decimals = metric.decimals ?? (Number.isInteger(metric.value) ? 0 : 1);
  const displayValue = new Intl.NumberFormat(lang === "hi" ? "hi-IN" : "en-IN", {
    maximumFractionDigits: decimals,
  }).format(metric.value);

  const isBloodPressure = metric.metricKey === "bp_systolic";
  const valueText = isBloodPressure && metric.pairedValue !== undefined
    ? `${displayValue}/${new Intl.NumberFormat("en-IN").format(metric.pairedValue)}`
    : displayValue;

  const spokenText = `${label}: ${valueText} ${metric.unit}${
    metric.previousValue !== undefined ? `, ${t("common.previous")} ${metric.previousValue}` : ""
  }`;
  const stateStyles: Record<string, { border: string; value: string }> = {
    WITHIN_RANGE: { border: "border-l-good-600", value: "text-good-700" },
    BELOW_RANGE: { border: "border-l-watch-600", value: "text-watch-700" },
    ABOVE_RANGE: { border: "border-l-watch-600", value: "text-watch-700" },
    CRITICAL: { border: "border-l-alert-600", value: "text-alert-700" },
  };
  const stateStyle = stateStyles[metric.status ?? ""];

  return (
    <Card className={cn("flex h-full flex-col border-l-4", stateStyle?.border)}>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span
              className="flex size-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"
              aria-hidden="true"
            >
              {METRIC_ICONS[metric.metricKey] ?? <Activity className="size-6" />}
            </span>
            <span className="font-medium text-ink-800">
              {!easyRead && <span aria-hidden="true" className="mr-1">{METRIC_EMOJI[metric.metricKey] ?? ""}</span>}
              {label}
            </span>
          </div>
          <ReadAloudButton text={spokenText} size="icon" />
        </div>

        <p className="flex flex-wrap items-baseline gap-2" aria-label={t("a11y.metricCard", { metric: label, value: valueText, unit: metric.unit })}>
          <span className={cn("text-3xl font-semibold leading-none tracking-tight", stateStyle?.value ?? "text-ink-900")}>{valueText}</span>
          <span className="text-base font-medium text-ink-500">{metric.unit}</span>
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          {metric.previousValue !== undefined && (
            <span className="text-muted">
              {t("common.previous")}: {new Intl.NumberFormat("en-IN", { maximumFractionDigits: decimals }).format(metric.previousValue)}
            </span>
          )}
          <TrendArrow direction={metric.direction} delta={metric.delta} unit={metric.unit} />
          {metric.status && <ResultStatusPill status={metric.status} />}
        </div>

        {metric.previousDate && (
          <p className="text-xs text-muted a11y-hide">
            {t("trends.changeSince")} · {formatDate(metric.previousDate, lang)}
          </p>
        )}

        {href && (
          <div className="mt-auto pt-1">
            <Link
              href={href}
              className={cn(
                "inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-brand-700 underline underline-offset-4 hover:text-brand-800",
              )}
            >
              {t("common.viewTrend")}
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { METRIC_EMOJI };
