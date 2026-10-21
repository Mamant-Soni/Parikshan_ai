import type { Metadata } from "next";
import { ProfileSetupForm } from "@/components/auth/profile-setup-form";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { ThemeQuickToggles } from "@/components/layout/accessibility-toggle";
import { requireUser } from "@/lib/auth/session";
import { getActiveProfile } from "@/lib/auth/guards";
import { createTranslator } from "@/lib/i18n";
import type { Language } from "@/types/domain";

export const metadata: Metadata = { title: "Profile setup" };

/**
 * Profile setup (step after login).
 *
 * Also where language and Easy Read Mode can be turned on before the user sees
 * any records — the audience that needs them most is the least likely to hunt
 * for them later.
 */
export default async function ProfileSetupPage() {
  const user = await requireUser();
  const profile = await getActiveProfile(user.id);
  const lang: Language = user.preferences?.language === "hi" ? "hi" : "en";
  const t = createTranslator(lang);

  return (
    <main className="min-h-dvh bg-canvas px-4 py-8">
      <div className="mx-auto mb-5 flex w-full max-w-2xl items-center justify-between gap-3">
        <p className="font-semibold text-ink-900">{t("setup.stepLabel")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <LanguageToggle />
          <ThemeQuickToggles />
        </div>
      </div>
      <ProfileSetupForm profileId={profile.id} initialName={profile.name} initialKind={profile.kind} />
    </main>
  );
}
