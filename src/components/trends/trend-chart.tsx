"use client";

import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n } from "@/components/providers/i18n-provider";
import { parseReferenceRange } from "@/lib/health/metrics";

/**
 * Trend chart.
 *
 * Deliberately restrained: one axis, one or two lines, a soft reference band
 * derived ONLY from the range printed on the user's own report. No colour-coded
 * "danger" zones, because the app never labels a value as dangerous.
 */

export type TrendChartPoint = {
  date: string;
  value?: number;
  value2?: number;
};

export function TrendChart({
  points,
  unit,
  label,
  label2,
  referenceRange,
  height = 300,
  series2Name,
}: {
  points: TrendChartPoint[];
  unit: string;
  label: string;
  label2?: string;
  series2Name?: string;
  referenceRange?: string | null;
  height?: number;
}) {
  const { t, lang } = useI18n();
  const range = parseReferenceRange(referenceRange);

  const data = React.useMemo(
    () =>
      points.map((point) => ({
        ...point,
        label: new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", {
          day: "numeric",
          month: "short",
          year: "2-digit",
        }).format(new Date(point.date)),
      })),
    [points, lang],
  );

  const values = points.flatMap((point) => [point.value, point.value2].filter((value): value is number => typeof value === "number"));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const padding = Math.max((max - min) * 0.25, 1);
  const domain: [number, number] = [
    Math.floor(Math.min(min, range?.low ?? min) - padding),
    Math.ceil(Math.max(max, Number.isFinite(range?.high ?? max) ? Math.max(max, range?.high ?? max) : max) + padding),
  ];

  const hasSecondSeries = points.some((point) => typeof point.value2 === "number");

  return (
    <div style={{ width: "100%", height }} role="img" aria-label={t("trends.chartAria", { metric: label })}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis domain={domain} tickLine={false} axisLine={false} width={52} />
          {range && Number.isFinite(range.low) && Number.isFinite(range.high) && (
            <ReferenceArea
              y1={range.low}
              y2={range.high}
              fill="var(--color-chart-point)"
              fillOpacity={0.07}
              stroke="none"
              ifOverflow="extendDomain"
            />
          )}
          <Tooltip
            contentStyle={{
              borderRadius: "0.9rem",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-ink-800)",
              border: "1px solid var(--color-chart-grid)",
              boxShadow: "0 12px 30px -18px rgba(15,23,42,0.35)",
              fontSize: "0.9rem",
            }}
            formatter={(value, name) => [`${value} ${unit}`, name === "value2" ? series2Name ?? label2 ?? "" : label]}
          />
          <Line
            type="monotone"
            dataKey="value"
            name={label}
            stroke="var(--color-chart-primary)"
            strokeWidth={3}
            dot={{ r: 4, fill: "var(--color-chart-primary)", strokeWidth: 0 }}
            activeDot={{ r: 6 }}
            connectNulls
          />
          {hasSecondSeries && (
            <Line
              type="monotone"
              dataKey="value2"
              name={series2Name ?? "—"}
              stroke="var(--color-chart-accent)"
              strokeWidth={2.5}
              strokeDasharray="5 4"
              dot={{ r: 3.5, fill: "var(--color-chart-accent)", strokeWidth: 0 }}
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Accessible alternative to the chart — a plain table of the same readings. */
export function TrendTable({
  rows,
}: {
  rows: { date: string; value: number; unit: string; recordId?: string | null; recordTitle?: string | null }[];
}) {
  const { t, lang } = useI18n();
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[24rem] border-collapse text-left text-sm">
        <caption className="sr-only">{t("trends.tableTitle")}</caption>
        <thead>
          <tr className="border-b border-ink-200 text-ink-600">
            <th scope="col" className="py-2 pr-3 font-medium">{t("trends.date")}</th>
            <th scope="col" className="py-2 pr-3 font-medium">{t("trends.value")}</th>
            <th scope="col" className="py-2 font-medium">{t("trends.source")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.date}-${index}`} className="border-b border-ink-100 last:border-0">
              <td className="py-2.5 pr-3 text-ink-700">
                {new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }).format(new Date(row.date))}
              </td>
              <td className="py-2.5 pr-3 font-semibold text-ink-900">
                {row.value} {row.unit}
              </td>
              <td className="py-2.5 text-ink-600">{row.recordTitle ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
