"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { recordTypeMeta } from "@/components/health/record-type-meta";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/providers/i18n-provider";
import { formatLongDate } from "@/lib/i18n/format";

export type RecordCardData = {
  id: string;
  type: string;
  title: string;
  recordDate: Date | string;
  doctorName?: string | null;
  facilityName?: string | null;
  labCount?: number;
  medicineCount?: number;
  status?: string;
  plainSummary?: string | null;
};

/** Record card used on the dashboard, timeline and family views. */
export function RecordCard({ record, compact = false }: { record: RecordCardData; compact?: boolean }) {
  const { t, lang, easyRead } = useI18n();
  const meta = recordTypeMeta(record.type);
  const values: string[] = [];
  if (record.labCount) values.push(t("timeline.valuesExtracted", { count: record.labCount }));
  if (record.medicineCount) values.push(t("timeline.medicinesDetected", { count: record.medicineCount }));

  return (
    <Card className="h-full transition-shadow hover:shadow-[var(--shadow-lift)]">
      <CardContent className={compact ? "flex flex-col gap-2" : "flex h-full flex-col gap-3"}>
        <div className="flex items-start gap-3">
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-ink-50 text-2xl"
            aria-hidden="true"
          >
            {meta.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold text-ink-900">{record.title}</h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
              <CalendarDays className="size-4" aria-hidden="true" />
              {formatLongDate(record.recordDate, lang)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={meta.variant}>{t(meta.labelKey)}</Badge>
          {record.status === "NEEDS_REVIEW" && <Badge variant="watch">{t("review.looksIncorrect")}</Badge>}
          {!easyRead && values.length > 0 && (
            <span className="text-sm text-ink-600">{values.join(" · ")}</span>
          )}
        </div>

        {(record.doctorName || record.facilityName) && !easyRead && (
          <p className="truncate text-sm text-muted">
            {record.doctorName}
            {record.doctorName && record.facilityName ? " · " : ""}
            {record.facilityName}
          </p>
        )}

        {record.plainSummary && (
          <p className="rounded-xl bg-ink-50 p-3 text-sm leading-relaxed text-ink-700">{record.plainSummary}</p>
        )}

        <div className="mt-auto pt-1">
          <Link
            href={`/records/${record.id}`}
            className="inline-flex min-h-9 items-center text-sm font-semibold text-brand-700 underline underline-offset-4 hover:text-brand-800"
          >
            {t("timeline.openRecord")}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
