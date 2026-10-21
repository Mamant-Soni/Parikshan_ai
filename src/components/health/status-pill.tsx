"use client";

import { ArrowDown, ArrowRight, ArrowUp, CheckCircle2, MinusCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/providers/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";
import type { ResultStatus } from "@/types/domain";

/**
 * Result status.
 *
 * Wording rule (see the spec): we say "Outside the reference range" or
 * "Below reference range" — never "dangerous", "critical" or "abnormal".
 */
export function ResultStatusPill({ status, size = "default" }: { status: ResultStatus | string; size?: "default" | "lg" }) {
  const { t } = useI18n();
  const map: Record<string, { variant: "good" | "watch" | "alert" | "neutral"; key: TranslationKey; icon: React.ReactNode }> = {
    WITHIN_RANGE: { variant: "good", key: "result.WITHIN_RANGE", icon: <CheckCircle2 className="size-3.5" aria-hidden="true" /> },
    BELOW_RANGE: { variant: "watch", key: "result.BELOW_RANGE", icon: <ArrowDown className="size-3.5" aria-hidden="true" /> },
    ABOVE_RANGE: { variant: "alert", key: "result.ABOVE_RANGE", icon: <ArrowUp className="size-3.5" aria-hidden="true" /> },
    UNKNOWN: { variant: "neutral", key: "result.UNKNOWN", icon: <MinusCircle className="size-3.5" aria-hidden="true" /> },
  };
  const entry = map[status] ?? map.UNKNOWN;
  return (
    <Badge variant={entry.variant} size={size}>
      {entry.icon}
      {t(entry.key)}
    </Badge>
  );
}

export function TrendArrow({ direction, delta, unit }: { direction: "up" | "down" | "flat" | "unknown"; delta?: number; unit?: string }) {
  const { t, lang } = useI18n();
  if (direction === "unknown") return null;
  const Icon = direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : ArrowRight;
  const label =
    direction === "up" ? t("trends.increased") : direction === "down" ? t("trends.decreased") : t("trends.stable");
  const formattedDelta =
    delta === undefined
      ? ""
      : new Intl.NumberFormat(lang === "hi" ? "hi-IN" : "en-IN", { maximumFractionDigits: 1 }).format(Math.abs(delta));

  return (
    <span
      className="inline-flex items-center gap-1 text-sm font-semibold"
      title={label}
      aria-label={`${label}${formattedDelta ? ` ${formattedDelta} ${unit ?? ""}` : ""}`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {formattedDelta && <span>{formattedDelta}{unit ? ` ${unit}` : ""}</span>}
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function MedicationStatusPill({ status }: { status: string }) {
  const { t } = useI18n();
  const map: Record<string, { variant: "good" | "brand" | "neutral"; key: TranslationKey }> = {
    ACTIVE: { variant: "good", key: "meds.statusActive" },
    COMPLETED: { variant: "neutral", key: "meds.statusCompleted" },
    UPCOMING: { variant: "brand", key: "meds.statusUpcoming" },
  };
  const entry = map[status] ?? map.COMPLETED;
  return <Badge variant={entry.variant}>{t(entry.key)}</Badge>;
}

export function SeverityPill({ severity }: { severity: string }) {
  const { t } = useI18n();
  const map: Record<string, { variant: "alert" | "watch" | "info" | "neutral"; key: TranslationKey }> = {
    MAJOR: { variant: "alert", key: "interactions.severityMajor" },
    MODERATE: { variant: "watch", key: "interactions.severityModerate" },
    MINOR: { variant: "info", key: "interactions.severityMinor" },
    UNKNOWN: { variant: "neutral", key: "interactions.severityUnknown" },
  };
  const entry = map[severity] ?? map.UNKNOWN;
  return <Badge variant={entry.variant}>{t(entry.key)}</Badge>;
}
