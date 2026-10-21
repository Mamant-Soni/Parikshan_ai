import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BarChart3, Languages, Mic, Pill, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { ResultStatusPill } from "@/components/health/status-pill";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { getCurrentUser } from "@/lib/auth/session";
import { createTranslator } from "@/lib/i18n";
import { DEMO_ABHA_NUMBER } from "@/lib/demo/account";
import { formatAbhaNumber } from "@/lib/fhir/abha";

export const metadata: Metadata = {
  title: "Parikshan — your health records, clearer and connected",
};

/**
 * Public landing page.
 *
 * The copy is deliberately honest about what this build is: a hackathon demo
 * whose OCR and AI run locally with labelled demo providers, and whose ABHA
 * support is a placeholder for an approved integration.
 */
export default async function LandingPage() {
  const user = await getCurrentUser();
  const t = createTranslator(user?.preferences?.language === "hi" ? "hi" : "en");

  const features = [
    { icon: Upload, titleKey: "landing.featureAssistantTitle", bodyKey: "landing.featureAssistantBody", href: "/upload" },
    { icon: BarChart3, titleKey: "landing.featureTrendsTitle", bodyKey: "landing.featureTrendsBody", href: "/trends" },
    { icon: Pill, titleKey: "landing.featureMedicationTitle", bodyKey: "landing.featureMedicationBody", href: "/medications" },
  ] as const;

  const accessibility = [
    { icon: Sparkles, titleKey: "landing.a11yEasyRead", bodyKey: "landing.a11yEasyReadBody" },
    { icon: ShieldCheck, titleKey: "landing.a11yProfiles", bodyKey: "landing.a11yProfilesBody" },
    { icon: Languages, titleKey: "landing.a11yLanguages", bodyKey: "landing.a11yLanguagesBody" },
    { icon: BarChart3, titleKey: "landing.a11yControls", bodyKey: "landing.a11yControlsBody" },
    { icon: Mic, titleKey: "landing.a11yReadAloud", bodyKey: "landing.a11yReadAloudBody" },
  ] as const;

  const steps = [
    { titleKey: "landing.howStep1Title", bodyKey: "landing.howStep1Body" },
    { titleKey: "landing.howStep2Title", bodyKey: "landing.howStep2Body" },
    { titleKey: "landing.howStep3Title", bodyKey: "landing.howStep3Body" },
  ] as const;

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-ink-200 bg-surface">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-2xl bg-brand-600 text-xl text-white">
            ❤
          </span>
          <span className="flex-1 font-semibold text-ink-900">{t("common.appName")}</span>
          <LanguageToggle />
          <ThemeToggle />
          <Button asChild variant="secondary">
            <Link href="/login">{t("auth.continue")}</Link>
          </Button>
        </div>
      </header>

      <div className="border-b border-watch-100 bg-watch-50 px-4 py-2.5 text-sm text-watch-800">
        <p className="mx-auto max-w-7xl font-medium">
          ⚠️ {t("disclaimer.title")} {t("disclaimer.body")}
        </p>
      </div>

      <main className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">
        {/* Hero */}
        <section className="grid gap-8 py-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:py-16">
          <div>
            <Badge variant="brand" size="lg" className="mb-4">
              <Sparkles className="size-4" aria-hidden="true" />
              {t("landing.heroBadge")}
            </Badge>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-ink-900 sm:text-5xl">
              {t("common.appName")}
            </h1>
            <p className="mt-3 text-2xl font-medium text-brand-700 sm:text-3xl">{t("common.tagline")}</p>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-600">{t("landing.heroSupport")}</p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href={user ? "/dashboard" : "/login?demo=1"}>
                  {t("landing.tryDemo")}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/login">{t("landing.getStarted")}</Link>
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted">{t("landing.tryDemoHint")}</p>

            <div className="mt-6 flex flex-wrap gap-2">
              <Badge variant="good">🌐 {t("lang.english")} + हिंदी</Badge>
              <Badge variant="info">🔒 {t("disclaimer.privacy")}</Badge>
              <Badge variant="neutral">🏥 {t("auth.abhaReady")}</Badge>
            </div>
          </div>

          {/* Illustrative preview of the demo data — no invented clinical values. */}
          <Card className="border-brand-100">
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink-600">{t("dashboard.healthOverview")}</p>
                <Badge variant="brand">{t("common.demoBadge")}</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-watch-100 border-l-4 border-l-watch-600 bg-watch-50/40 p-3.5">
                  <p className="text-sm text-muted">🩸 {t("metric.hemoglobin")}</p>
                  <p className="mt-1 text-2xl font-semibold text-watch-700">
                    11.0 <span className="text-base font-medium text-ink-500">g/dL</span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <ResultStatusPill status="BELOW_RANGE" />
                    <span className="text-xs text-muted">{t("common.previous")}: 12.6 ↓</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-good-100 border-l-4 border-l-good-600 bg-good-50/40 p-3.5">
                  <p className="text-sm text-muted">💓 {t("metric.bp_systolic")}</p>
                  <p className="mt-1 text-2xl font-semibold text-good-700">
                    120/80 <span className="text-base font-medium text-ink-500">mmHg</span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <ResultStatusPill status="WITHIN_RANGE" />
                    <span className="text-xs text-muted">{t("common.previous")}: 126/84</span>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl bg-brand-50 p-3.5">
                <p className="text-sm font-semibold text-brand-800">{t("summary.title")}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-700">
                  {t("summary.whatItSays")}: {t("summary.allWithinRange")}
                </p>
              </div>
              <p className="text-xs text-muted">{t("summary.mockNotice")}</p>
            </CardContent>
          </Card>
        </section>

        {/* Features */}
        <section aria-labelledby="features-heading" className="py-8">
          <h2 id="features-heading" className="text-2xl font-semibold text-ink-900 sm:text-3xl">
            {t("landing.featuresTitle")}
          </h2>
          <p className="mt-2 max-w-2xl text-base text-muted">{t("landing.featuresSubtitle")}</p>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <li key={feature.titleKey}>
                  <Card className="h-full">
                    <CardContent className="flex h-full flex-col gap-3">
                      <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-50">
                        <Icon className="size-6 text-brand-600" aria-hidden="true" />
                      </span>
                      <h3 className="text-lg font-semibold text-ink-900">{t(feature.titleKey)}</h3>
                      <p className="text-base leading-relaxed text-ink-600">{t(feature.bodyKey)}</p>
                      <Link
                        href={feature.href}
                        className="mt-auto inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-brand-700 underline underline-offset-4"
                      >
                        {t("common.viewDetails")}
                      </Link>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>

        {/* How it works */}
        <section aria-labelledby="how-heading" className="py-8">
          <h2 id="how-heading" className="text-2xl font-semibold text-ink-900 sm:text-3xl">
            {t("landing.howTitle")}
          </h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.titleKey}>
                <Card className="h-full bg-surface/70">
                  <CardContent className="space-y-3">
                    <span
                      aria-hidden="true"
                      className="flex size-9 items-center justify-center rounded-full bg-brand-600 font-semibold text-white"
                    >
                      {index + 1}
                    </span>
                    <h3 className="text-lg font-semibold text-ink-900">{t(step.titleKey)}</h3>
                    <p className="text-base leading-relaxed text-ink-600">{t(step.bodyKey)}</p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        {/* Accessibility */}
        <section aria-labelledby="a11y-heading" className="mt-8 rounded-[2rem] border border-brand-100 bg-surface p-6 sm:p-8">
          <div className="max-w-2xl">
            <h2 id="a11y-heading" className="text-2xl font-semibold text-ink-900 sm:text-3xl">
              {t("landing.a11yTitle")}
            </h2>
            <p className="mt-2 text-base text-muted">{t("landing.a11ySubtitle")}</p>
          </div>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accessibility.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.titleKey} className="flex items-start gap-3 rounded-2xl border border-ink-200 p-4">
                  <Icon className="mt-0.5 size-6 shrink-0 text-brand-600" aria-hidden="true" />
                  <span>
                    <span className="block font-semibold text-ink-900">{t(item.titleKey)}</span>
                    <span className="block text-sm text-muted">{t(item.bodyKey)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Demo call to action */}
        <section className="mt-10 rounded-[2rem] bg-brand-600 p-6 text-white sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold sm:text-3xl">{t("landing.tryDemo")}</h2>
              <p className="mt-2 text-base text-brand-50">{t("auth.demoPatientHint")}</p>
              <p className="mt-2 text-sm text-brand-50">
                {t("auth.demoCredentials")}: Demo Patient · {formatAbhaNumber(DEMO_ABHA_NUMBER)}
              </p>
            </div>
            <Button asChild size="lg" variant="secondary">
              <Link href="/login?demo=1">
                <ArrowRight aria-hidden="true" />
                {t("auth.continueWithDemo")}
              </Link>
            </Button>
          </div>
        </section>

        <footer className="mt-10 space-y-3 border-t border-ink-200 pt-6 text-sm text-muted">
          <p className="font-medium text-ink-700">⚠️ {t("disclaimer.short")}</p>
          <p>{t("auth.demoOnly")} — {t("auth.demoOnlyBody")}</p>
          <p>{t("disclaimer.demoNote")}</p>
        </footer>
      </main>
    </div>
  );
}
