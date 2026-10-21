"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/components/providers/i18n-provider";
import { TrendArrow } from "./status-pill";
import { ReadAloudButton } from "@/components/layout/read-aloud-button";
import { formatNumber } from "@/lib/i18n/format";
import type { TranslationKey } from "@/lib/i18n";

/**
 * "AI Insights" — what changed between the two most recent reports.
 *
 * These are arithmetic comparisons of the user's own values. The wording is
 * deliberately factual ("Hemoglobin decreased from 14.5 to 11.0 g/dL") with no
 * interpretation, and every row links to the full trend.
 */
export type InsightItem = {
  id: string;
  metricKey: string;
  labelKey: TranslationKey | null;
  label: string;
  from: number;
  to: number;
  unit: string;
  direction: "up" | "down" | "flat";
  delta: number;
};

export function InsightList({ insights }: { insights: InsightItem[] }) {
  const { t, lang, easyRead } = useI18n();

  if (!insights.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-brand-600" aria-hidden="true" />
            {t("dashboard.aiInsights")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted">{t("dashboard.insightsNoData")}</p>
        </CardContent>
      </Card>
    );
  }

  const heading =
    insights.length === 1 ? t("dashboard.insightsChangedOne") : t("dashboard.insightsChanged", { count: insights.length });

  const lines = insights.map((insight) => {
    const label = insight.labelKey ? t(insight.labelKey) : insight.label;
    const directionWord =
      insight.direction === "up" ? t("trends.increased") : insight.direction === "down" ? t("trends.decreased") : t("trends.stable");
    return `${label} ${directionWord}: ${formatNumber(insight.from, lang, 1)} → ${formatNumber(insight.to, lang, 1)} ${insight.unit}`;
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-5 text-brand-600" aria-hidden="true" />
          {t("dashboard.aiInsights")}
        </CardTitle>
        <ReadAloudButton text={`${heading}. ${lines.join(". ")}`} size="icon" />
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-base font-medium text-ink-800">{heading}</p>
        <ol className="space-y-2.5">
          {insights.map((insight, index) => {
            const label = insight.labelKey ? t(insight.labelKey) : insight.label;
            return (
              <li
                key={insight.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-200 p-3"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700"
                  >
                    {index + 1}
                  </span>
                  <p className="text-sm leading-relaxed text-ink-800">
                    {label}{" "}
                    {insight.direction === "up" ? t("trends.increased") : insight.direction === "down" ? t("trends.decreased") : t("trends.stable")}{" "}
                    <span className="font-semibold">
                      {formatNumber(insight.from, lang, 1)} → {formatNumber(insight.to, lang, 1)} {insight.unit}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {!easyRead && <TrendArrow direction={insight.direction} delta={insight.delta} unit={insight.unit} />}
                  <Link
                    href={`/trends?metric=${insight.metricKey}`}
                    className="text-sm font-semibold text-brand-700 underline underline-offset-4 hover:text-brand-800"
                  >
                    {t("common.viewDetails")}
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-muted">{t("dashboard.referenceRangeNote")}</p>
      </CardContent>
    </Card>
  );
}
