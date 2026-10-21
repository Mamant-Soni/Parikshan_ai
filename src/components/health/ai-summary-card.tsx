"use client";

import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, MessageCircleQuestion, Sparkles, Stethoscope, BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useI18n } from "@/components/providers/i18n-provider";
import { ReadAloudButton } from "@/components/layout/read-aloud-button";
import { generateSummaryAction } from "@/lib/actions/records";
import type { HealthSummarySections } from "@/types/domain";

/**
 * "Your Health Record — Explained Simply".
 *
 * The summary is generated on demand (never silently), and every section is
 * framed as an explanation of the uploaded document — the wording rules from
 * the spec are applied in the AI layer, not here.
 */
export function AISummaryCard({
  recordId,
  initialSummary,
  initialProvider,
  initialIsMock,
  autoRead = false,
}: {
  recordId: string;
  initialSummary: HealthSummarySections | null;
  initialProvider?: string | null;
  initialIsMock?: boolean;
  autoRead?: boolean;
}) {
  const { t, prefs } = useI18n();
  const [summary, setSummary] = React.useState<HealthSummarySections | null>(initialSummary);
  const [provider, setProvider] = React.useState<string | null>(initialProvider ?? null);
  const [isMock, setIsMock] = React.useState<boolean>(initialIsMock ?? true);
  const [isGenerating, startGenerating] = React.useTransition();

  const generate = () => {
    startGenerating(async () => {
      const result = await generateSummaryAction(recordId);
      if (!result.ok) {
        toast.error(t("error.aiFailed"));
        return;
      }
      setSummary(result.summary);
      setProvider(result.provider);
      setIsMock(result.isMock);
      toast.success(t("common.saved"));
    });
  };

  const spokenText = React.useMemo(() => {
    if (!summary) return "";
    return [
      t("summary.whatItSays"),
      summary.whatItSays,
      t("summary.looksNormal"),
      summary.looksNormal.join(". "),
      t("summary.needsAttention"),
      summary.needsAttention.join(". "),
      t("summary.discussWithDoctor"),
      summary.discussWithDoctor.join(". "),
    ].join(". ");
  }, [summary, t]);

  // Optional auto-read for users who enable it in Settings.
  const hasAutoRead = React.useRef(false);
  React.useEffect(() => {
    if (!autoRead || !prefs.autoReadAloud || !summary || hasAutoRead.current) return;
    hasAutoRead.current = true;
  }, [autoRead, prefs.autoReadAloud, summary]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-3 border-b border-ink-100 pb-4">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="size-5 text-brand-600" aria-hidden="true" />
            {t("summary.title")}
          </CardTitle>
          {provider && (
            <p className="mt-1 text-xs text-muted">
              {t("summary.generatedBy")}: {provider}
              {isMock ? ` · ${t("summary.mockNotice")}` : ""}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {summary && <ReadAloudButton text={spokenText} size="icon" />}
          <Button onClick={generate} disabled={isGenerating} variant={summary ? "secondary" : "primary"}>
            <Sparkles aria-hidden="true" />
            {isGenerating
              ? t("summary.generating")
              : summary
                ? t("summary.regenerate")
                : t("summary.generate")}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        {isGenerating && !summary && (
          <div role="status" aria-live="polite" className="space-y-3">
            <p className="flex items-center gap-2 font-medium text-brand-700">
              <Sparkles className="size-5 animate-pulse" aria-hidden="true" />
              {t("summary.generating")}
            </p>
            <div className="space-y-2" aria-hidden="true">
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-4 animate-pulse rounded-full bg-ink-100" style={{ width: `${90 - row * 18}%` }} />
              ))}
            </div>
          </div>
        )}

        {!summary && !isGenerating && (
          <div className="rounded-2xl border border-dashed border-ink-300 p-6 text-center">
            <p className="text-base font-medium text-ink-700">{t("summary.placeholder")}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">{t("summary.placeholderHint")}</p>
          </div>
        )}

        {summary && (
          <div className="space-y-5">
            <SummarySection title={t("summary.whatItSays")} icon={<BookOpen className="size-5 text-brand-600" aria-hidden="true" />}>
              <p className="text-base leading-relaxed text-ink-700">{summary.whatItSays}</p>
            </SummarySection>

            <SummarySection title={t("summary.looksNormal")} icon={<CheckCircle2 className="size-5 text-good-600" aria-hidden="true" />}>
              <BulletList items={summary.looksNormal} tone="good" />
            </SummarySection>

            <SummarySection title={t("summary.needsAttention")} icon={<AlertTriangle className="size-5 text-watch-600" aria-hidden="true" />}>
              <BulletList items={summary.needsAttention} tone="watch" />
            </SummarySection>

            {summary.termExplanations.length > 0 && (
              <SummarySection title={t("summary.termMeanings")} icon={<Stethoscope className="size-5 text-info-600" aria-hidden="true" />}>
                <dl className="space-y-2.5">
                  {summary.termExplanations.map((entry) => (
                    <div key={entry.term} className="rounded-xl bg-ink-50 p-3">
                      <dt className="font-semibold text-ink-900">{entry.term}</dt>
                      <dd className="text-sm leading-relaxed text-ink-700">{entry.explanation}</dd>
                    </div>
                  ))}
                </dl>
              </SummarySection>
            )}

            <SummarySection
              title={t("summary.discussWithDoctor")}
              icon={<MessageCircleQuestion className="size-5 text-brand-600" aria-hidden="true" />}
            >
              <BulletList items={summary.discussWithDoctor} tone="brand" />
            </SummarySection>

            <Alert variant="neutral">
              <p className="text-sm">{t("summary.disclaimer")}</p>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummarySection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-base font-semibold text-ink-900">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function BulletList({ items, tone }: { items: string[]; tone: "good" | "watch" | "brand" }) {
  const dot =
    tone === "good" ? "bg-good-600" : tone === "watch" ? "bg-watch-600" : "bg-brand-600";
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2.5 text-base leading-relaxed text-ink-700">
          <span aria-hidden="true" className={`mt-2 size-2 shrink-0 rounded-full ${dot}`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
