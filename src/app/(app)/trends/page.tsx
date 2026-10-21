import Link from "next/link";
import type { Metadata } from "next";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { TrendExplorer } from "@/components/trends/trend-explorer";
import { EmptyState, PageHeader } from "@/components/health/states";
import { requireUser } from "@/lib/auth/session";
import { getActiveProfile } from "@/lib/auth/guards";
import { getMetricSeries } from "@/lib/database/queries";
import { createTranslator } from "@/lib/i18n";
import type { Language } from "@/types/domain";

export const metadata: Metadata = { title: "Health trends" };

/**
 * Trends screen.
 *
 * Charts are drawn from stored metric points only. When a metric has a single
 * reading the explorer says so instead of drawing a misleading line.
 */
export default async function TrendsPage() {
  const user = await requireUser();
  const profile = await getActiveProfile(user.id);
  const series = await getMetricSeries(profile.id);
  const lang: Language = user.preferences?.language === "hi" ? "hi" : "en";
  const t = createTranslator(lang);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("trends.title")}
        description={t("trends.subtitle", { name: profile.name })}
        emoji="📈"
        action={
          <Button asChild variant="secondary">
            <Link href="/upload">
              <Upload aria-hidden="true" />
              {t("nav.upload")}
            </Link>
          </Button>
        }
      />

      {series.length === 0 ? (
        <EmptyState
          title={t("empty.metricsTitle")}
          description={t("empty.metricsBody")}
          actionLabel={t("nav.upload")}
          actionHref="/upload"
        />
      ) : (
        <>
          <Alert variant="neutral">
            <p className="text-sm leading-relaxed">{t("trends.severityNote")}</p>
          </Alert>
          <TrendExplorer series={series} />
        </>
      )}
    </div>
  );
}
