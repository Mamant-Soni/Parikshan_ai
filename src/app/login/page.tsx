import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AuthPanel } from "@/components/auth/auth-panel";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { createTranslator } from "@/lib/i18n";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Sign-in / profile setup.
 *
 * `?demo=1` (used by the landing-page demo buttons) focuses the one-click demo
 * account so a judge can be inside the app in a single tap.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const params = await searchParams;
  const t = createTranslator("en");

  return (
    <main className="min-h-dvh bg-canvas px-4 py-8 sm:px-6">
      <div className="mx-auto mb-6 flex w-full max-w-5xl items-center gap-3">
        <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-2xl bg-brand-600 text-xl text-white">
          ❤
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-ink-900">{t("common.appName")}</span>
          <span className="block text-sm text-muted">{t("common.tagline")}</span>
        </span>
        <LanguageToggle />
          <ThemeToggle />
      </div>
      <div className="mx-auto w-full max-w-5xl">
        <AuthPanel demoFocus={params.demo === "1"} />
      </div>
    </main>
  );
}
