"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, Filter, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/providers/i18n-provider";
import { EmptyState } from "@/components/health/states";
import { recordTypeMeta } from "@/components/health/record-type-meta";
import { formatLongDate } from "@/lib/i18n/format";
import { RECORD_TYPES } from "@/types/domain";
import { cn } from "@/lib/utils";

export type TimelineEntry = {
  id: string;
  type: string;
  title: string;
  recordDate: string;
  doctorName: string | null;
  facilityName: string | null;
  diagnosisTerms: string[];
  labCount: number;
  medicineCount: number;
  plainSummary: string | null;
};

/**
 * Health timeline: filter by type, search, sort, open.
 * Grouped by month so a long history stays readable.
 */
export function TimelineExplorer({ entries }: { entries: TimelineEntry[] }) {
  const { t, lang, easyRead } = useI18n();
  const [query, setQuery] = React.useState("");
  const [type, setType] = React.useState<string>("ALL");
  const [sort, setSort] = React.useState<"newest" | "oldest">("newest");

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = entries.filter((entry) => {
      if (type !== "ALL" && entry.type !== type) return false;
      if (!needle) return true;
      return (
        entry.title.toLowerCase().includes(needle) ||
        (entry.doctorName ?? "").toLowerCase().includes(needle) ||
        (entry.facilityName ?? "").toLowerCase().includes(needle) ||
        entry.diagnosisTerms.join(" ").toLowerCase().includes(needle)
      );
    });
    return list.sort((a, b) => {
      const aTime = new Date(a.recordDate).getTime();
      const bTime = new Date(b.recordDate).getTime();
      return sort === "newest" ? bTime - aTime : aTime - bTime;
    });
  }, [entries, query, type, sort]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, TimelineEntry[]>();
    for (const entry of filtered) {
      const key = new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", {
        month: "long",
        year: "numeric",
      }).format(new Date(entry.recordDate));
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered, lang]);

  if (!entries.length) {
    return (
      <EmptyState
        title={t("timeline.empty")}
        description={t("timeline.emptyBody")}
        actionLabel={t("timeline.uploadRecord")}
        actionHref="/upload"
      />
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-2">
            <label htmlFor="timeline-search" className="text-sm font-medium text-ink-800">
              {t("timeline.searchPlaceholder")}
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-400" aria-hidden="true" />
              <Input
                id="timeline-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("timeline.searchPlaceholder")}
                className="pl-11"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="timeline-type" className="text-sm font-medium text-ink-800">
              {t("timeline.filterType")}
            </label>
            <div className="relative">
              <Filter className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
              <select
                id="timeline-type"
                value={type}
                onChange={(event) => setType(event.target.value)}
                className="min-h-[var(--a11y-tap)] w-full appearance-none rounded-xl border border-ink-200 bg-surface pl-10 pr-4 text-base text-ink-900 focus-visible:outline-3 focus-visible:outline-brand-500"
              >
                <option value="ALL">{t("common.all")}</option>
                {RECORD_TYPES.map((recordType) => (
                  <option key={recordType} value={recordType}>
                    {t(recordTypeMeta(recordType).labelKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={() => setSort((current) => (current === "newest" ? "oldest" : "newest"))}
            className="justify-center sm:mb-0"
            aria-label={sort === "newest" ? t("common.sortNewest") : t("common.sortOldest")}
          >
            <CalendarDays aria-hidden="true" />
            {sort === "newest" ? t("common.sortNewest") : t("common.sortOldest")}
          </Button>
        </CardContent>
      </Card>

      <p className="text-sm text-muted">
        {filtered.length === 1 ? t("timeline.resultsCountOne") : t("timeline.resultsCount", { count: filtered.length })}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title={t("timeline.noMatch")}
          description={t("timeline.noMatchBody")}
          actionLabel={t("timeline.clearFilters")}
          actionHref="/timeline"
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(([month, items]) => (
            <section key={month}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">{month}</h2>
              <ol className="relative space-y-3 border-l-2 border-ink-200 pl-4 sm:pl-6">
                {items.map((entry) => {
                  const meta = recordTypeMeta(entry.type);
                  return (
                    <li key={entry.id} className="relative">
                      <span
                        aria-hidden="true"
                        className="absolute -left-[1.6rem] top-4 flex size-7 items-center justify-center rounded-full border-2 border-white bg-brand-50 text-sm sm:-left-[2.1rem]"
                      >
                        {meta.emoji}
                      </span>
                      <Card className="transition-shadow hover:shadow-[var(--shadow-lift)]">
                        <CardContent className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-muted">{formatLongDate(entry.recordDate, lang)}</p>
                            <h3 className="mt-0.5 font-semibold text-ink-900">{entry.title}</h3>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Badge variant={meta.variant}>{t(meta.labelKey)}</Badge>
                              {entry.labCount > 0 && (
                                <span className="text-sm text-ink-600">{t("timeline.valuesExtracted", { count: entry.labCount })}</span>
                              )}
                              {entry.medicineCount > 0 && (
                                <span className="text-sm text-ink-600">{t("timeline.medicinesDetected", { count: entry.medicineCount })}</span>
                              )}
                            </div>
                            {entry.plainSummary && !easyRead && (
                              <p className={cn("mt-2 text-sm leading-relaxed text-ink-600")}>{entry.plainSummary}</p>
                            )}
                          </div>
                          <Button asChild variant="secondary">
                            <Link href={`/records/${entry.id}`}>{t("timeline.openRecord")}</Link>
                          </Button>
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
