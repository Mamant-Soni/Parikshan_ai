import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Bot, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { InsightList } from "@/components/health/insight-list";
import { TermExplorer } from "@/components/health/term-explorer";
import { EmptyState, PageHeader, SectionHeading } from "@/components/health/states";
import { recordTypeMeta } from "@/components/health/record-type-meta";
import { requireUser } from "@/lib/auth/session";
import { getActiveProfile } from "@/lib/auth/guards";
import { getDashboardSnapshot, getTimelineRecords } from "@/lib/database/queries";
import { createTranslator } from "@/lib/i18n";
import { formatLongDate } from "@/lib/i18n/format";
import type { Language } from "@/types/domain";

export const metadata: Metadata = { title: "AI health summary" };

/**
 * AI health summary.
 *
 * Two layers, both grounded in uploaded data:
 *  • a change-focused summary across reports (arithmetic, no diagnosis), and
 *  • the plain-language glossary for the terms that actually appear in this
 *    person's documents.
 */
export default async function SummaryPage() {
  const user = await requireUser();
  const profile = await getActiveProfile(user.id);
  const [snapshot, records] = await Promise.all([
    getDashboardSnapshot(user.id, profile.id, profile.name),
    getTimelineRecords(profile.id),
  ]);
  const lang: Language = user.preferences?.language === "hi" ? "hi" : "en";
  const t = createTranslator(lang);

  const insights = snapshot.insights.map((insight) => ({
    id: insight.id,
    metricKey: insight.metricKey,
    labelKey: insight.labelKey,
    label: insight.label,
    from: insight.from,
    to: insight.to,
    unit: insight.unit,
    direction: insight.direction,
    delta: insight.delta,
  }));

  const termsInRecords = records.flatMap((record) => record.diagnosisTerms);
  const withSummaries = records.filter((record) => record.plainSummary);

  if (records.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader title={t("summary.title")} description={t("summary.subtitle")} emoji="🧠" />
        <EmptyState
          title={t("summary.emptyTitle")}
          description={t("summary.emptyBody")}
          actionLabel={t("nav.upload")}
          actionHref="/upload"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("summary.title")}
        description={t("summary.subtitle")}
        emoji="🧠"
        action={
          <Button asChild>
            <Link href="/assistant">
              <Bot aria-hidden="true" />
              {t("nav.assistant")}
            </Link>
          </Button>
        }
      />

      <Alert variant="brand">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-semibold">{t("summary.generatedBy", { provider: t("common.demoProvider") })}</p>
          <p className="text-sm text-muted">{t("summary.mockNotice")}</p>
          <p className="text-sm font-medium">{t("summary.disclaimer")}</p>
        </div>
      </Alert>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <InsightList insights={insights} />

          <section aria-labelledby="record-summaries">
            <SectionHeading title={t("summary.recordSummaries")} description={t("summary.recordSummariesBody")} />
            <h2 id="record-summaries" className="sr-only">
              {t("summary.recordSummaries")}
            </h2>
            <ul className="space-y-3">
              {records.map((record) => {
                const meta = recordTypeMeta(record.type);
                return (
                  <li key={record.id}>
                    <Card>
                      <CardContent className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={meta.variant}>{t(meta.labelKey)}</Badge>
                          <span className="text-sm text-muted">{formatLongDate(record.recordDate, lang)}</span>
                        </div>
                        <p className="font-semibold text-ink-900">{record.title}</p>
                        <p className="text-base leading-relaxed text-ink-600">
                          {record.plainSummary ?? t("summary.notGenerated")}
                        </p>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/records/${record.id}`}>
                            {record.plainSummary ? t("summary.readFull") : t("summary.generate")}
                            <ArrowRight aria-hidden="true" />
                          </Link>
                        </Button>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{t("summary.whatChanged")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-base leading-relaxed text-ink-700">
              <p>{t("summary.whatChangedBody")}</p>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
                <li>{t("summary.safety1")}</li>
                <li>{t("summary.safety2")}</li>
                <li>{t("summary.safety3")}</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("summary.storedSummaries")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted">{t("summary.storedSummariesBody", { count: withSummaries.length, total: records.length })}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <TermExplorer termsInRecords={termsInRecords} />
    </div>
  );
}
