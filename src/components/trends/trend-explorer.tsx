"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Info, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/components/providers/i18n-provider";
import { ReadAloudButton } from "@/components/layout/read-aloud-button";
import { EmptyState } from "@/components/health/states";
import { ResultStatusPill, TrendArrow } from "@/components/health/status-pill";
import { TrendChart, TrendTable } from "./trend-chart";
import { evaluateAgainstRange, getMetric, pairBloodPressure } from "@/lib/health/metrics";
import { formatDate, formatNumber } from "@/lib/i18n/format";
import type { MetricSeries } from "@/lib/database/queries";
import { cn } from "@/lib/utils";

/**
 * Health-trend dashboard.
 *
 * Shows one metric at a time (a wall of charts is unreadable for the audiences
 * this app targets). Comparison wording stays descriptive: "Compared with your
 * previous report", "Outside the reference range" — never "dangerous".
 */
export function TrendExplorer({ series }: { series: MetricSeries[] }) {
  const { t, lang, easyRead } = useI18n();
  const searchParams = useSearchParams();
  const requested = searchParams.get("metric");

  const bloodPressure = React.useMemo(() => pairBloodPressure(
    series
      .filter((entry) => entry.metricKey === "bp_systolic" || entry.metricKey === "bp_diastolic")
      .flatMap((entry) =>
        entry.points.map((point) => ({
          metricKey: entry.metricKey,
          recordedAt: new Date(point.date),
          value: point.value,
        })),
      ),
  ), [series]);

  const available = React.useMemo(() => {
    const list = series.filter((entry) => entry.metricKey !== "bp_diastolic");
    return list.sort((a, b) => {
      const aFeatured = getMetric(a.metricKey)?.featured ? 1 : 0;
      const bFeatured = getMetric(b.metricKey)?.featured ? 1 : 0;
      if (aFeatured !== bFeatured) return bFeatured - aFeatured;
      return b.points.length - a.points.length;
    });
  }, [series]);

  const [activeKey, setActiveKey] = React.useState<string>(
    requested && series.some((entry) => entry.metricKey === requested)
      ? requested
      : available[0]?.metricKey ?? "",
  );

  React.useEffect(() => {
    if (requested && series.some((entry) => entry.metricKey === requested)) setActiveKey(requested);
  }, [requested, series]);

  if (!series.length) {
    return (
      <EmptyState
        title={t("empty.metricsTitle")}
        description={t("empty.metricsBody")}
        actionLabel={t("timeline.uploadRecord")}
        actionHref="/upload"
      />
    );
  }

  const active = series.find((entry) => entry.metricKey === activeKey) ?? available[0];
  const definition = active ? getMetric(active.metricKey) : undefined;
  const metricLabel = definition ? t(definition.labelKey) : active?.label ?? t("metric.metricFallback");

  const points = active?.points ?? [];
  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  const delta = latest && previous ? latest.value - previous.value : undefined;
  const direction: "up" | "down" | "flat" | "unknown" =
    delta === undefined ? "unknown" : Math.abs(delta) < 0.05 ? "flat" : delta > 0 ? "up" : "down";
  const status = latest ? evaluateAgainstRange(latest.value, active?.referenceRange ?? null) : "UNKNOWN";

  const chartData = React.useMemo(() => {
    if (active?.metricKey === "bp_systolic" && bloodPressure.length) {
      return bloodPressure.map((entry) => ({
        date: entry.date.toISOString(),
        value: entry.systolic,
        value2: entry.diastolic,
      }));
    }
    return points.map((point) => ({ date: point.date, value: point.value }));
  }, [active?.metricKey, bloodPressure, points]);

  const spokenSummary = latest
    ? `${metricLabel}. ${t("common.current")}: ${latest.value} ${active?.unit ?? ""}. ${
        previous ? `${t("common.previous")}: ${previous.value}.` : ""
      } ${t("trends.discussChanges")}`
    : metricLabel;

  return (
    <div className="space-y-5">
      {/* Metric picker: big, obvious buttons rather than a tiny dropdown. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("trends.chooseMetric")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-wrap gap-2">
            {available.map((entry) => {
              const entryDefinition = getMetric(entry.metricKey);
              const isActive = entry.metricKey === active?.metricKey;
              return (
                <li key={entry.metricKey}>
                  <Button
                    type="button"
                    variant={isActive ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => setActiveKey(entry.metricKey)}
                    aria-pressed={isActive}
                    className={cn("gap-2", !easyRead && "text-sm")}
                  >
                    {entryDefinition ? t(entryDefinition.labelKey) : entry.label}
                    <Badge variant={isActive ? "brand" : "neutral"} size="default">
                      {entry.points.length}
                    </Badge>
                  </Button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 border-b border-ink-100 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <TrendingUp className="size-5 text-brand-600" aria-hidden="true" />
              {metricLabel}
            </CardTitle>
            <p className="mt-1 text-sm text-muted">
              {points.length === 1
                ? t("trends.pointsAcrossOne")
                : t("trends.pointsAcross", { count: points.length })}
              {active?.referenceRange ? ` · ${t("trends.referenceBand")}: ${active.referenceRange}` : ""}
            </p>
          </div>
          <ReadAloudButton text={spokenSummary} />
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatBox label={t("common.previous")} value={previous ? `${formatNumber(previous.value, lang, 1)} ${active?.unit ?? ""}` : "—"} hint={previous ? formatDate(previous.date, lang) : undefined} />
            <StatBox label={t("common.current")} value={latest ? `${formatNumber(latest.value, lang, 1)} ${active?.unit ?? ""}` : "—"} hint={latest ? formatDate(latest.date, lang) : undefined} strong />
            <StatBox
              label={t("common.change")}
              value={
                delta === undefined ? "—" : `${delta > 0 ? "+" : ""}${formatNumber(delta, lang, 1)} ${active?.unit ?? ""}`
              }
              extra={<TrendArrow direction={direction} delta={delta} unit={active?.unit} />}
            />
          </div>

          {latest && (
            <div className="flex flex-wrap items-center gap-3">
              <ResultStatusPill status={status} size="lg" />
              <p className="text-sm text-muted">{t("trends.changeSince")}</p>
            </div>
          )}

          <Tabs defaultValue="chart">
            <TabsList>
              <TabsTrigger value="chart">{t("trends.title")}</TabsTrigger>
              <TabsTrigger value="table">{t("trends.tableTitle")}</TabsTrigger>
            </TabsList>
            <TabsContent value="chart">
              {points.length < 2 ? (
                <div className="rounded-2xl border border-dashed border-ink-300 p-6 text-center">
                  <p className="font-medium text-ink-800">{t("trends.notEnough")}</p>
                  <p className="mt-1 text-sm text-muted">{t("trends.notEnoughBody")}</p>
                  <Button asChild variant="secondary" className="mt-4">
                    <a href="/upload">{t("timeline.uploadRecord")}</a>
                  </Button>
                </div>
              ) : (
                <TrendChart
                  points={chartData}
                  unit={active?.unit ?? ""}
                  label={metricLabel}
                  series2Name={t("trends.bpTitle")}
                  referenceRange={active?.referenceRange ?? null}
                />
              )}
            </TabsContent>
            <TabsContent value="table">
              <TrendTable
                rows={points.map((point) => ({
                  date: point.date,
                  value: point.value,
                  unit: active?.unit ?? "",
                  recordTitle: point.recordTitle,
                }))}
              />
            </TabsContent>
          </Tabs>

          <Alert variant="neutral">
            <Info className="mt-0.5 size-5 shrink-0 text-info-600" aria-hidden="true" />
            <div className="space-y-1 text-sm">
              <p className="font-medium text-ink-800">{t("trends.discussChanges")}</p>
              <p className="text-muted">{t("trends.severityNote")}</p>
            </div>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}

function StatBox({
  label,
  value,
  hint,
  strong,
  extra,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-ink-200 p-3.5">
      <p className="text-sm text-muted">{label}</p>
      <p className={cn("mt-1 font-semibold text-ink-900", strong ? "text-2xl" : "text-xl")}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      {extra && <div className="mt-1">{extra}</div>}
    </div>
  );
}
