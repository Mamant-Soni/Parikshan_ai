import Link from "next/link";
import { ArrowRight, CalendarDays, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { featureText } from "@/lib/i18n/features";
import { formatDate } from "@/lib/i18n/format";
import type { UpcomingCareItem } from "@/lib/care/upcoming";
import type { Language } from "@/types/domain";

/**
 * Preventive-care summary for the dashboard. Read-only: tasks are created and
 * managed on /care. Overdue tasks are labelled with text (not colour alone) and
 * the card never implies a notification was delivered.
 */
export function UpcomingCareCard({
  lang,
  items,
  openCount,
}: {
  lang: Language;
  items: UpcomingCareItem[];
  openCount: number;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-5 text-brand-700" aria-hidden="true" />
          {featureText(lang, "care.dashboardTitle")}
        </CardTitle>
        <Badge variant="neutral">
          {featureText(lang, "care.dashboardCount", { n: openCount })}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <p className="text-sm text-muted">{featureText(lang, "care.dashboardBody")}</p>

        {items.length === 0 ? (
          <p className="rounded-xl bg-canvas px-3 py-3 text-sm leading-relaxed text-ink-700">
            {featureText(lang, "care.dashboardEmpty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map(({ task, overdue }) => (
              <li
                key={task.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-ink-200 bg-surface px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{task.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-600">
                    <Clock className="size-3.5" aria-hidden="true" />
                    {featureText(lang, "care.dashboardDue", {
                      date: formatDate(`${task.dueDate}T00:00:00`, lang),
                    })}
                    {task.dueTime ? ` · ${task.dueTime}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {overdue && <Badge variant="alert">{featureText(lang, "care.dashboardOverdue")}</Badge>}
                  {task.source === "CLINICIAN" && (
                    <Badge variant="info">{featureText(lang, "care.dashboardClinician")}</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/care">
              {featureText(lang, "care.dashboardViewAll")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <span className="text-xs text-muted">{featureText(lang, "care.remNote")}</span>
        </div>
      </CardContent>
    </Card>
  );
}
